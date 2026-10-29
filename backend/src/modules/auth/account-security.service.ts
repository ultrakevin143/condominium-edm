import type { Prisma, PrismaClient, User } from "@prisma/client";
import type { Actor } from "../../shared/context.js";
import { ApiError } from "../../shared/errors.js";
import { lockAccounts } from "../../shared/account-lock.js";
import {
  hashPassword,
  verifyPassword,
  newToken,
  tokenHash,
} from "../../shared/security.js";
import { authorize } from "../../middleware/permissions.js";
import {
  questionSchema,
  changePasswordSchema,
  adminRecoverySchema,
  recoveryIdentitySchema,
  recoveryResetSchema,
  normalizeAnswer,
} from "./account-security.schemas.js";

const windowMs = 15 * 60000;
const maxAttempts = 5;
const invalidRecovery = () =>
  new ApiError(
    400,
    "INVALID_RECOVERY",
    "Recovery verification failed. Check the code and security answer, or contact the Property manager.",
  );

async function checkCurrent(
  tx: Prisma.TransactionClient,
  user: User,
  password: string,
  answer: string | undefined,
  requireQuestion: boolean,
  actor: Actor,
  now: Date,
) {
  if (user.securityLockedUntil && user.securityLockedUntil > now)
    return new ApiError(
      429,
      "VERIFICATION_LOCKED",
      "Too many verification attempts. Try again after 15 minutes.",
    );
  if (requireQuestion && !user.securityAnswerHash)
    return new ApiError(
      409,
      "QUESTION_REQUIRED",
      "Set your security question in Account security first.",
    );
  const correctPassword = verifyPassword(password, user.passwordHash);
  const correctAnswer =
    !user.securityAnswerHash ||
    (typeof answer === "string" &&
      verifyPassword(normalizeAnswer(answer), user.securityAnswerHash));
  if (!correctPassword || !correctAnswer) {
    const attempts = (user.securityLockedUntil ? 0 : user.securityFailures) + 1;
    await tx.user.update({
      where: { id: user.id },
      data: {
        securityFailures: attempts,
        securityLockedUntil:
          attempts >= maxAttempts ? new Date(now.getTime() + windowMs) : null,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.userId,
        ip: actor.ip,
        action: "ACCOUNT_VERIFICATION_FAILED",
        entity: "User",
        entityId: user.id,
        after: { attempts },
      },
    });
    return new ApiError(
      400,
      "VERIFICATION_FAILED",
      "Current password or security answer is incorrect.",
    );
  }
  if (user.securityFailures || user.securityLockedUntil)
    await tx.user.update({
      where: { id: user.id },
      data: { securityFailures: 0, securityLockedUntil: null },
    });
  return null;
}

async function invalidateAccess(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date,
) {
  const sessions = await tx.session.deleteMany({ where: { userId } });
  await tx.passwordRecovery.updateMany({
    where: { userId, usedAt: null, revokedAt: null },
    data: { revokedAt: now },
  });
  return sessions.count;
}

export async function securityProfile(db: PrismaClient, actor: Actor) {
  return db.$transaction(async (tx) => {
    const user = await authorize(tx, actor, "tenants:read");
    return {
      question: user.securityQuestion,
      configured: Boolean(user.securityQuestion && user.securityAnswerHash),
    };
  });
}

export async function setSecurityQuestion(
  db: PrismaClient,
  actor: Actor,
  input: unknown,
  now = new Date(),
) {
  const data = questionSchema.parse(input);
  const result = await db.$transaction(
    async (tx) => {
      await lockAccounts(tx, [actor.userId]);
      const user = await authorize(tx, actor, "tenants:read");
      const failed = await checkCurrent(
        tx,
        user,
        data.currentPassword,
        data.answer,
        Boolean(user.securityAnswerHash),
        actor,
        now,
      );
      if (failed) return failed;
      await tx.user.update({
        where: { id: user.id },
        data: {
          securityQuestion: data.question,
          securityAnswerHash: hashPassword(data.newAnswer),
          credentialVersion: { increment: 1 },
        },
      });
      const sessions = await invalidateAccess(tx, user.id, now);
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          ip: actor.ip,
          action: "SECURITY_QUESTION_CHANGED",
          entity: "User",
          entityId: user.id,
          after: { configured: true, revokedSessions: sessions },
        },
      });
      return { signedOut: true };
    },
    { timeout: 20000 },
  );
  if (result instanceof ApiError) throw result;
  return result;
}

export async function changePassword(
  db: PrismaClient,
  actor: Actor,
  input: unknown,
  now = new Date(),
) {
  const data = changePasswordSchema.parse(input);
  const result = await db.$transaction(
    async (tx) => {
      await lockAccounts(tx, [actor.userId]);
      const user = await authorize(tx, actor, "tenants:read");
      const failed = await checkCurrent(
        tx,
        user,
        data.currentPassword,
        data.answer,
        true,
        actor,
        now,
      );
      if (failed) return failed;
      if (verifyPassword(data.newPassword, user.passwordHash))
        return new ApiError(
          422,
          "PASSWORD_UNCHANGED",
          "Choose a password different from your current password.",
        );
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: hashPassword(data.newPassword),
          credentialVersion: { increment: 1 },
        },
      });
      const sessions = await invalidateAccess(tx, user.id, now);
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          ip: actor.ip,
          action: "PASSWORD_CHANGED",
          entity: "User",
          entityId: user.id,
          after: { revokedSessions: sessions },
        },
      });
      return { signedOut: true };
    },
    { timeout: 20000 },
  );
  if (result instanceof ApiError) throw result;
  return result;
}

export async function assistRecovery(
  db: PrismaClient,
  actor: Actor,
  targetId: string,
  input: unknown,
  action: "issue" | "clear-question",
  now = new Date(),
) {
  const data = adminRecoverySchema.parse(input);
  const result = await db.$transaction(
    async (tx) => {
      await lockAccounts(tx, [actor.userId, targetId]);
      const admin = await authorize(tx, actor, "governance:manage");
      if (actor.userId === targetId)
        return new ApiError(
          409,
          "SELF_RECOVERY",
          "Another administrator must assist your recovery.",
        );
      const target = await tx.user.findUnique({ where: { id: targetId } });
      if (!target?.active)
        return new ApiError(404, "NOT_FOUND", "Choose an active account.");
      const failed = await checkCurrent(
        tx,
        admin,
        data.adminPassword,
        data.adminAnswer,
        true,
        actor,
        now,
      );
      if (failed) return failed;
      await tx.passwordRecovery.updateMany({
        where: { userId: targetId, usedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      if (action === "clear-question") {
        await tx.user.update({
          where: { id: targetId },
          data: {
            securityQuestion: null,
            securityAnswerHash: null,
            securityFailures: 0,
            securityLockedUntil: null,
            credentialVersion: { increment: 1 },
          },
        });
        await invalidateAccess(tx, targetId, now);
        await tx.auditLog.create({
          data: {
            actorId: actor.userId,
            ip: actor.ip,
            action: "SECURITY_QUESTION_RESET",
            entity: "User",
            entityId: targetId,
            after: { verificationNote: data.verificationNote },
          },
        });
        return { cleared: true };
      }
      const code = newToken();
      const expiresAt = new Date(now.getTime() + windowMs);
      await tx.passwordRecovery.create({
        data: {
          userId: targetId,
          issuedById: admin.id,
          tokenHash: tokenHash(code),
          credentialVersion: target.credentialVersion,
          expiresAt,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          ip: actor.ip,
          action: "RECOVERY_CODE_ISSUED",
          entity: "User",
          entityId: targetId,
          after: {
            expiresAt: expiresAt.toISOString(),
            verificationNote: data.verificationNote,
          },
        },
      });
      return { code, expiresAt: expiresAt.toISOString() };
    },
    { timeout: 20000 },
  );
  if (result instanceof ApiError) throw result;
  return result;
}

function usableRecovery(
  record: {
    usedAt: Date | null;
    revokedAt: Date | null;
    expiresAt: Date;
    attempts: number;
    credentialVersion: number;
    user: User;
  } | null,
  email: string,
  now: Date,
) {
  return (
    record &&
    !record.usedAt &&
    !record.revokedAt &&
    record.expiresAt > now &&
    record.attempts < maxAttempts &&
    record.user.active &&
    record.user.email === email &&
    record.credentialVersion === record.user.credentialVersion
  );
}

export async function recoveryDetails(
  db: PrismaClient,
  input: unknown,
  now = new Date(),
) {
  const data = recoveryIdentitySchema.parse(input);
  const record = await db.passwordRecovery.findUnique({
    where: { tokenHash: tokenHash(data.code) },
    include: { user: true },
  });
  if (!usableRecovery(record, data.email, now)) throw invalidRecovery();
  return { question: record!.user.securityQuestion };
}

export async function resetPassword(
  db: PrismaClient,
  input: unknown,
  ip?: string,
  now = new Date(),
) {
  const data = recoveryResetSchema.parse(input);
  const result = await db.$transaction(
    async (tx) => {
      const candidate = await tx.passwordRecovery.findUnique({
        where: { tokenHash: tokenHash(data.code) },
        select: { id: true, userId: true },
      });
      if (!candidate) return invalidRecovery();
      await lockAccounts(tx, [candidate.userId]);
      const record = await tx.passwordRecovery.findUnique({
        where: { id: candidate.id },
        include: { user: true },
      });
      if (!usableRecovery(record, data.email, now)) return invalidRecovery();
      const user = record!.user;
      if (
        user.securityAnswerHash &&
        (!data.answer ||
          !verifyPassword(
            normalizeAnswer(data.answer),
            user.securityAnswerHash,
          ))
      ) {
        await tx.passwordRecovery.update({
          where: { id: candidate.id },
          data: { attempts: { increment: 1 } },
        });
        await tx.auditLog.create({
          data: {
            ip,
            action: "RECOVERY_VERIFICATION_FAILED",
            entity: "User",
            entityId: user.id,
          },
        });
        return invalidRecovery();
      }
      if (verifyPassword(data.newPassword, user.passwordHash))
        return new ApiError(
          422,
          "PASSWORD_UNCHANGED",
          "Choose a different new password.",
        );
      const consumed = await tx.passwordRecovery.updateMany({
        where: {
          id: candidate.id,
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
          attempts: { lt: maxAttempts },
        },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) return invalidRecovery();
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: hashPassword(data.newPassword),
          credentialVersion: { increment: 1 },
          securityFailures: 0,
          securityLockedUntil: null,
        },
      });
      const sessions = await invalidateAccess(tx, user.id, now);
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          ip,
          action: "PASSWORD_RECOVERED",
          entity: "User",
          entityId: user.id,
          after: { assistedBy: record!.issuedById, revokedSessions: sessions },
        },
      });
      return { signedOut: true };
    },
    { timeout: 20000 },
  );
  if (result instanceof ApiError) throw result;
  return result;
}
