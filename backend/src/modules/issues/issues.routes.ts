import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { requirePermission } from "../../middleware/authentication.js";
import { issuesQuerySchema } from "./issues.schemas.js";
import { actOnIssue, issueDetail } from "./issues.service.js";
export function issueRoutes(db: PrismaClient) {
  const router = Router();
  router.use(requirePermission("quality:manage"));
  router.get("/", async (req, res) => {
    const q = issuesQuerySchema.parse(req.query);
    const latest =
      q.runId ??
      (
        await db.pipelineRun.findFirst({
          where: { status: { in: ["SUCCEEDED", "PARTIAL"] } },
          orderBy: [{ startedAt: "desc" }, { id: "desc" }],
        })
      )?.id;
    if (!latest) {
      res.json({ data: { items: [], total: 0, page: q.page, limit: q.limit } });
      return;
    }
    // Without visitor permission, require a known non-visitor staging row.
    // Prisma's `is` relation filter excludes null staging rows as well, which
    // avoids exposing an issue whose source cannot be classified.
    const where = {
      runId: latest,
      status: q.status,
      severity: q.severity,
      ...(!res.locals.profile.permissions.includes("visitors:read")
        ? { staging: { is: { source: { not: "visitor_log" } } } }
        : {}),
      ...(q.rule ? { rule: { code: q.rule } } : {}),
    };
    const [items, total] = await db.$transaction([
      db.qualityIssue.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        include: {
          rule: { select: { code: true, title: true, dimension: true } },
          staging: { select: { source: true, sourceId: true, status: true } },
        },
      }),
      db.qualityIssue.count({ where }),
    ]);
    if (items.some((item) => item.staging?.source === "visitor_log")) {
      await db.auditLog.create({
        data: {
          actorId: res.locals.actor.userId,
          ip: res.locals.actor.ip,
          action: "CLASSIFIED_READ",
          entity: "QualityIssueList",
          after: { runId: latest, category: "visitor_log" },
        },
      });
    }
    res.json({
      data: { items, total, page: q.page, limit: q.limit, runId: latest },
    });
  });
  router.get("/:id", async (req, res) => {
    const { id } = z.object({ id: z.uuid() }).strict().parse(req.params);
    z.object({}).strict().parse(req.query);
    res.json({ data: await issueDetail(db, res.locals.actor, id) });
  });
  router.patch("/:id", async (req, res) => {
    const { id } = z.object({ id: z.uuid() }).strict().parse(req.params);
    z.object({}).strict().parse(req.query);
    res.json({ data: await actOnIssue(db, res.locals.actor, id, req.body) });
  });
  return router;
}
