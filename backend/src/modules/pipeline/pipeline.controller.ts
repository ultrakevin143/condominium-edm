import type { PrismaClient } from "@prisma/client";
import type { RequestHandler } from "express";
import { z } from "zod";
import { pageSchema } from "../issues/issues.schemas.js";
import { runPipeline } from "./pipeline.service.js";
import { ApiError } from "../../shared/errors.js";
export function pipelineController(db: PrismaClient) {
  const list: RequestHandler = async (req, res) => {
    const { page, limit } = pageSchema.parse(req.query);
    const [items, total] = await db.$transaction([
      db.pipelineRun.findMany({
        orderBy: { startedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.pipelineRun.count(),
    ]);
    res.json({ data: { items, total, page, limit } });
  };
  const detail: RequestHandler = async (req, res) => {
    const { id } = z.object({ id: z.uuid() }).strict().parse(req.params);
    z.object({}).strict().parse(req.query);
    const run = await db.pipelineRun.findUnique({
      where: { id },
      include: { stages: { orderBy: { createdAt: "asc" } } },
    });
    if (!run) throw new ApiError(404, "NOT_FOUND", "Pipeline run not found.");
    res.json({ data: run });
  };
  const start: RequestHandler = async (req, res) => {
    z.object({}).strict().parse(req.body);
    z.object({}).strict().parse(req.query);
    res.status(201).json({ data: await runPipeline(db, res.locals.actor) });
  };
  return { list, detail, start };
}
