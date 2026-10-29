import type { RequestHandler } from "express";
import type { PrismaClient } from "@prisma/client";
import { ApiError } from "../shared/errors.js";
import { tokenHash } from "../shared/security.js";
import type { Actor } from "../shared/context.js";
declare global {
  // Express extends response locals through its declaration namespace.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      actor: Actor;
      profile: {
        id: string;
        name: string;
        role: string;
        permissions: string[];
      };
    }
  }
}
export function authentication(db: PrismaClient): RequestHandler {
  return async (req, res, next) => {
    const token: unknown = req.cookies?.bern_session;
    if (typeof token !== "string" || token.length > 200)
      throw new ApiError(401, "UNAUTHENTICATED", "Sign in to continue.");
    const session = await db.session.findUnique({
      where: { tokenHash: tokenHash(token) },
      include: { user: { include: { role: true } } },
    });
    if (
      !session ||
      !session.user.active ||
      session.expiresAt <= new Date() ||
      session.credentialVersion !== session.user.credentialVersion
    )
      throw new ApiError(401, "UNAUTHENTICATED", "Sign in to continue.");
    const user = session.user;
    res.locals.actor = { userId: user.id, ip: req.ip };
    res.locals.profile = {
      id: user.id,
      name: user.name,
      role: user.role.code,
      permissions: user.role.permissions,
    };
    next();
  };
}
export function requirePermission(permission: string): RequestHandler {
  return (_req, res, next) => {
    if (!res.locals.profile.permissions.includes(permission))
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Your role does not permit this action.",
      );
    next();
  };
}
