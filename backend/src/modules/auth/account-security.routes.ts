import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { requirePermission } from "../../middleware/authentication.js";
import {
  securityProfile,
  setSecurityQuestion,
  changePassword,
  assistRecovery,
  recoveryDetails,
  resetPassword,
} from "./account-security.service.js";

const empty = z.object({}).strict();
const id = z.object({ id: z.uuid() }).strict();
function limiter(limit: number) {
  return rateLimit({
    windowMs: 15 * 60000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) =>
      res
        .status(429)
        .json({
          error: {
            code: "RATE_LIMITED",
            message:
              "Too many verification requests. Try again after 15 minutes.",
          },
        }),
  });
}

export function publicRecoveryRoutes(db: PrismaClient) {
  const router = Router();
  router.use((_req, res, next) => {
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    next();
  });
  router.use(limiter(8));
  router.post("/details", async (req, res) => {
    empty.parse(req.query);
    res.json({ data: await recoveryDetails(db, req.body) });
  });
  router.post("/reset", async (req, res) => {
    empty.parse(req.query);
    const data = await resetPassword(db, req.body, req.ip);
    res.clearCookie("bern_session", { path: "/" }).json({ data });
  });
  return router;
}

export function accountSecurityRoutes(db: PrismaClient) {
  const router = Router();
  router.use(requirePermission("tenants:read"));
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.get("/security", async (req, res) => {
    empty.parse(req.query);
    res.json({ data: await securityProfile(db, res.locals.actor) });
  });
  router.use(limiter(10));
  router.put("/security-question", async (req, res) => {
    empty.parse(req.query);
    const data = await setSecurityQuestion(db, res.locals.actor, req.body);
    res.clearCookie("bern_session", { path: "/" }).json({ data });
  });
  router.post("/password", async (req, res) => {
    empty.parse(req.query);
    const data = await changePassword(db, res.locals.actor, req.body);
    res.clearCookie("bern_session", { path: "/" }).json({ data });
  });
  router.post(
    "/users/:id/recovery-code",
    requirePermission("governance:manage"),
    async (req, res) => {
      empty.parse(req.query);
      const params = id.parse(req.params);
      res.json({
        data: await assistRecovery(
          db,
          res.locals.actor,
          params.id,
          req.body,
          "issue",
        ),
      });
    },
  );
  router.delete(
    "/users/:id/security-question",
    requirePermission("governance:manage"),
    async (req, res) => {
      empty.parse(req.query);
      const params = id.parse(req.params);
      res.json({
        data: await assistRecovery(
          db,
          res.locals.actor,
          params.id,
          req.body,
          "clear-question",
        ),
      });
    },
  );
  return router;
}
