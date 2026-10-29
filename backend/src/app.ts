import express, { type ErrorRequestHandler } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "./shared/errors.js";
import { authentication } from "./middleware/authentication.js";
import { pipelineRoutes } from "./modules/pipeline/pipeline.routes.js";
import { qualityRoutes } from "./modules/quality/quality.routes.js";
import { issueRoutes } from "./modules/issues/issues.routes.js";
import { login } from "./modules/auth/auth.service.js";
import { tokenHash } from "./shared/security.js";
import { warehouseRoutes } from "./modules/warehouse/warehouse.routes.js";
import { governanceRoutes } from "./modules/governance/governance.routes.js";
import {
  accountSecurityRoutes,
  publicRecoveryRoutes,
} from "./modules/auth/account-security.routes.js";

export function createApp(db: PrismaClient, origin: string) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "32kb" }));
  app.use(cookieParser());
  app.use((req, _res, next) => {
    if (
      (req.headers.origin && req.headers.origin !== origin) ||
      (!["GET", "HEAD", "OPTIONS"].includes(req.method) &&
        req.headers.origin !== origin)
    )
      throw new ApiError(
        403,
        "INVALID_ORIGIN",
        "Request origin is not allowed.",
      );
    next();
  });
  const cookie = {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: origin.startsWith("https:"),
    path: "/",
    maxAge: 12 * 3600000,
  };
  app.get("/health", (_req, res) => res.json({ data: { status: "ok" } }));
  app.post(
    "/auth/login",
    rateLimit({
      windowMs: 15 * 60000,
      limit: 8,
      handler: (_req, res) =>
        res.status(429).json({
          error: {
            code: "RATE_LIMITED",
            message: "Wait before trying to sign in again.",
          },
        }),
    }),
    async (req, res) => {
      z.object({}).strict().parse(req.query);
      const result = await login(db, req.body, req.ip);
      if (typeof req.cookies?.bern_session === "string")
        await db.session.deleteMany({
          where: { tokenHash: tokenHash(req.cookies.bern_session) },
        });
      res
        .cookie("bern_session", result.token, cookie)
        .json({ data: result.profile });
    },
  );
  app.use("/auth/recovery", publicRecoveryRoutes(db));
  app.use(authentication(db));
  app.get("/auth/me", (req, res) => {
    z.object({}).strict().parse(req.query);
    res.json({ data: res.locals.profile });
  });
  app.post("/auth/logout", async (req, res) => {
    z.object({}).strict().parse(req.body);
    z.object({}).strict().parse(req.query);
    await db.$transaction(async (tx) => {
      await tx.session.deleteMany({
        where: { tokenHash: tokenHash(String(req.cookies.bern_session)) },
      });
      await tx.auditLog.create({
        data: {
          actorId: res.locals.actor.userId,
          ip: req.ip,
          action: "LOGOUT",
          entity: "User",
          entityId: res.locals.actor.userId,
        },
      });
    });
    res.clearCookie("bern_session", cookie).json({ data: { signedOut: true } });
  });
  app.use("/pipeline/runs", pipelineRoutes(db));
  app.use("/quality", qualityRoutes(db));
  app.use("/issues", issueRoutes(db));
  app.use("/warehouse", warehouseRoutes(db));
  app.use("/governance", governanceRoutes(db));
  app.use("/account", accountSecurityRoutes(db));
  app.use((_req, _res, next) =>
    next(new ApiError(404, "NOT_FOUND", "API route not found.")),
  );
  const errors: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(422).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Check the request fields, query and parameters.",
        },
      });
      return;
    }
    if (error instanceof ApiError) {
      res
        .status(error.status)
        .json({ error: { code: error.code, message: error.message } });
      return;
    }
    if (error?.type === "entity.parse.failed") {
      res.status(400).json({
        error: {
          code: "INVALID_JSON",
          message: "Request body must be valid JSON.",
        },
      });
      return;
    }
    if (error?.type === "entity.too.large") {
      res.status(413).json({
        error: {
          code: "BODY_TOO_LARGE",
          message: "Request body exceeds 32 KB.",
        },
      });
      return;
    }
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "The request could not be completed.",
      },
    });
  };
  app.use(errors);
  return app;
}
