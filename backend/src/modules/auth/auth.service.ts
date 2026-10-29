import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../../shared/errors.js";
import { lockAccounts } from "../../shared/account-lock.js";
import {
  hashPassword,
  newToken,
  tokenHash,
  verifyPassword,
} from "../../shared/security.js";
const dummyHash = hashPassword(newToken());
const schema = z
  .object({
    email: z
      .email()
      .max(200)
      .transform((s) => s.toLowerCase()),
    password: z.string().min(1).max(128),
  })
  .strict();
export async function login(db: PrismaClient, input: unknown, ip?: string) {
  const data = schema.parse(input);
  const candidate = await db.user.findUnique({
    where: { email: data.email },
    select: { id: true },
  });
  if (!candidate) {
    verifyPassword(data.password, dummyHash);
    throw new ApiError(401, "INVALID_LOGIN", "Email or password is incorrect.");
  }
  return db.$transaction(
    async (tx) => {
      await lockAccounts(tx, [candidate.id]);
      const user = await tx.user.findUnique({
        where: { id: candidate.id },
        include: { role: true },
      });
      if (!user?.active || !verifyPassword(data.password, user.passwordHash))
        throw new ApiError(
          401,
          "INVALID_LOGIN",
          "Email or password is incorrect.",
        );
      const token = newToken();
      await tx.session.create({
        data: {
          userId: user.id,
          tokenHash: tokenHash(token),
          credentialVersion: user.credentialVersion,
          expiresAt: new Date(Date.now() + 12 * 3600000),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          ip,
          action: "LOGIN",
          entity: "User",
          entityId: user.id,
        },
      });
      return {
        token,
        profile: {
          id: user.id,
          name: user.name,
          role: user.role.code,
          permissions: user.role.permissions,
        },
      };
    },
    { timeout: 20000 },
  );
}
