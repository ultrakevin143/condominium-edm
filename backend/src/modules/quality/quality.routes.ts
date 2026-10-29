import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { requirePermission } from "../../middleware/authentication.js";
import { qualityHistory } from "./quality.service.js";
export function qualityRoutes(db: PrismaClient) {
  const router = Router();
  router.use(requirePermission("quality:read"));
  router.get("/rules", async (req, res) => {
    z.object({}).strict().parse(req.query);
    res.json({
      data: await db.qualityRule.findMany({ orderBy: { code: "asc" } }),
    });
  });
  router.get("/history", async (req, res) => {
    z.object({}).strict().parse(req.query);
    res.json({ data: await qualityHistory(db) });
  });
  return router;
}
