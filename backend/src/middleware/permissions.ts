import type { Prisma } from "@prisma/client";
import { ApiError } from "../shared/errors.js";
import type { Actor } from "../shared/context.js";

export async function authorize(
  tx: Prisma.TransactionClient,
  actor: Actor,
  permission: string,
) {
  const user = await tx.user.findUnique({
    where: { id: actor.userId },
    include: { role: true },
  });
  if (!user?.active)
    throw new ApiError(
      401,
      "UNAUTHENTICATED",
      "Sign in with an active account.",
    );
  if (!user.role.permissions.includes(permission))
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Your role does not permit this action.",
    );
  return user;
}
