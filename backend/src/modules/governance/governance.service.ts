import type { PrismaClient } from "@prisma/client";
import { authorize } from "../../middleware/permissions.js";
import { ApiError } from "../../shared/errors.js";
import type { Actor } from "../../shared/context.js";
import { lockAccounts } from "../../shared/account-lock.js";
export function governanceService(db: PrismaClient) {
  return {
    catalog: () =>
      db.fieldClassification.findMany({
        include: { owner: true, policy: true },
        orderBy: [{ entity: "asc" }, { field: "asc" }],
      }),
    roles: () => db.role.findMany({ orderBy: { code: "asc" } }),
    policies: () => db.policy.findMany({ orderBy: { name: "asc" } }),
    users: () =>
      db.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          active: true,
          roleId: true,
          role: { select: { name: true, code: true } },
        },
        orderBy: { email: "asc" },
      }),
    async updatePolicy(
      actor: Actor,
      id: string,
      data: {
        description: string;
        expectedDescription: string;
        reason: string;
      },
    ) {
      return db.$transaction(async (tx) => {
        await authorize(tx, actor, "governance:manage");
        const count = await tx.policy.updateMany({
          where: { id, description: data.expectedDescription },
          data: { description: data.description },
        });
        if (!count.count)
          throw new ApiError(
            409,
            "STALE_POLICY",
            "This policy changed. Reload before editing.",
          );
        await tx.auditLog.create({
          data: {
            actorId: actor.userId,
            ip: actor.ip,
            action: "POLICY_UPDATED",
            entity: "Policy",
            entityId: id,
            before: { description: data.expectedDescription },
            after: { description: data.description, reason: data.reason },
          },
        });
        return tx.policy.findUniqueOrThrow({ where: { id } });
      });
    },
    async audit(
      actor: Actor,
      q: { page: number; limit: number; action?: string; entity?: string },
    ) {
      return db.$transaction(async (tx) => {
        await authorize(tx, actor, "audit:read");
        const where = {
          ...(q.action ? { action: q.action } : {}),
          ...(q.entity ? { entity: q.entity } : {}),
        };
        const items = await tx.auditLog.findMany({
            where,
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            skip: (q.page - 1) * q.limit,
            take: q.limit,
          }),
          total = await tx.auditLog.count({ where });
        // Audit event details may include earlier classified edits.
        await tx.auditLog.create({
          data: {
            actorId: actor.userId,
            ip: actor.ip,
            action: "AUDIT_READ",
            entity: "AuditLog",
            after: { records: items.length },
          },
        });
        return { items, total, page: q.page, limit: q.limit };
      });
    },
    async updateRole(
      actor: Actor,
      id: string,
      data: { roleId: string; expectedRoleId: string; reason: string },
    ) {
      await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(6281051)`;
        await lockAccounts(tx, [actor.userId, id]);
        await authorize(tx, actor, "governance:manage");
        if (id === actor.userId)
          throw new ApiError(
            409,
            "SELF_CHANGE",
            "Another administrator must change your role.",
          );
        const role = await tx.role.findUnique({ where: { id: data.roleId } });
        if (!role)
          throw new ApiError(422, "INVALID_ROLE", "Choose an existing role.");
        const current = await tx.user.findUnique({
          where: { id },
          include: { role: true },
        });
        if (!current) throw new ApiError(404, "NOT_FOUND", "User not found.");
        if (current.roleId !== data.expectedRoleId)
          throw new ApiError(
            409,
            "STALE_USER",
            "The user role changed. Reload the list.",
          );
        if (
          current.role.code === "admin" &&
          current.active &&
          role.code !== "admin" &&
          (await tx.user.count({
            where: { active: true, role: { code: "admin" } },
          })) <= 1
        )
          throw new ApiError(
            409,
            "LAST_ADMIN",
            "Keep at least one active administrator.",
          );
        await tx.user.update({
          where: { id },
          data: { roleId: role.id, credentialVersion: { increment: 1 } },
        });
        await tx.session.deleteMany({ where: { userId: id } });
        await tx.passwordRecovery.updateMany({
          where: { userId: id, usedAt: null, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.userId,
            ip: actor.ip,
            action: "USER_ROLE_UPDATED",
            entity: "User",
            entityId: id,
            before: { roleId: current.roleId },
            after: { roleId: role.id, reason: data.reason },
          },
        });
      });
      return { updated: true };
    },
  };
}
