import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { rateLimit } from "express-rate-limit";
import { requirePermission } from "../../middleware/authentication.js";
import { pipelineController } from "./pipeline.controller.js";
export function pipelineRoutes(db: PrismaClient) {
  const router = Router(),
    controller = pipelineController(db);
  router.get("/", requirePermission("quality:read"), controller.list);
  router.get("/:id", requirePermission("quality:read"), controller.detail);
  router.post(
    "/",
    requirePermission("pipeline:run"),
    rateLimit({
      windowMs: 60000,
      limit: 5,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (_req, res) =>
        res.status(429).json({
          error: {
            code: "RATE_LIMITED",
            message: "Wait before running the pipeline again.",
          },
        }),
    }),
    controller.start,
  );
  return router;
}
