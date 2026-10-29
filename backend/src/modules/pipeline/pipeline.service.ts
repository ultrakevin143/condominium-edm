import { Prisma, type PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { Actor } from "../../shared/context.js";
import { ApiError } from "../../shared/errors.js";
import { authorize } from "../../middleware/permissions.js";
import { adapters } from "./adapters.js";
import { load } from "./pipeline.repository.js";
import { prepare, sources } from "./transform.js";
import { evaluate } from "../quality/engine.js";

export const pipelineLock = 6281050;
export async function lockPipeline(tx: Prisma.TransactionClient) {
  const [result] = await tx.$queryRaw<
    { locked: boolean }[]
  >`SELECT pg_try_advisory_xact_lock(${pipelineLock}) AS locked`;
  if (!result?.locked)
    throw new ApiError(
      409,
      "PIPELINE_BUSY",
      "A pipeline or correction is already running.",
    );
}
export async function pipelineWork(
  tx: Prisma.TransactionClient,
  actor: Actor,
  now: Date,
) {
  const run = await tx.pipelineRun.create({ data: { startedAt: now } });
  await tx.auditLog.create({
    data: {
      actorId: actor.userId,
      ip: actor.ip,
      action: "PIPELINE_STARTED",
      entity: "PipelineRun",
      entityId: run.id,
    },
  });
  const extracted = [];
  let emptySource = false;
  for (const source of sources) {
    const batch = await adapters[source](tx);
    extracted.push(...batch);
    if (batch.length === 0) emptySource = true;
    await tx.pipelineStageLog.create({
      data: {
        runId: run.id,
        source,
        stage: "EXTRACT",
        rowCount: batch.length,
        message:
          batch.length === 0
            ? "Source returned no records; previously loaded records were preserved."
            : null,
      },
    });
  }
  if (extracted.length > 500)
    throw new ApiError(
      422,
      "SOURCE_LIMIT",
      "This synchronous demo supports up to 500 source rows per run.",
    );
  const excluded = await tx.sourceDisposition.findMany();
  const quarantinedSources = new Set(
    excluded.map((entry) => `${entry.source}:${entry.sourceId}`),
  );
  const rows = prepare(extracted, quarantinedSources);
  const ruleRows = await tx.qualityRule.findMany({
    where: { enabled: true },
    orderBy: { code: "asc" },
  });
  if (!ruleRows.some((r) => r.code === "record_validity"))
    throw new ApiError(
      422,
      "MISSING_RULE",
      "The canonical validity rule must be enabled.",
    );
  const outcomes = evaluate(ruleRows, rows, now);
  const staging = new Map<string, string>();
  let loaded = 0,
    quarantined = 0,
    deduplicated = 0;
  const stagingRows: Prisma.StagingRowCreateManyInput[] = [];
  for (const row of rows) {
    const status = row.intrinsicErrors.length
      ? "QUARANTINED"
      : row.duplicate
        ? "DEDUPLICATED"
        : "LOADED";
    if (status === "LOADED") loaded++;
    else if (status === "QUARANTINED") quarantined++;
    else deduplicated++;
    const id = randomUUID();
    stagingRows.push({
      id,
      runId: run.id,
      source: row.source,
      sourceId: row.sourceId,
      payload: row.payload,
      status,
      reason:
        row.intrinsicErrors.join(" ") ||
        (row.duplicate
          ? "Merged into the existing tenant and lease identity."
          : null),
    });
    staging.set(`${row.source}:${row.sourceId}`, id);
  }
  await tx.stagingRow.createMany({ data: stagingRows });
  const issues: Prisma.QualityIssueCreateManyInput[] = [];
  for (const outcome of outcomes) {
    await tx.qualityResult.create({
      data: {
        runId: run.id,
        ruleId: outcome.rule.id,
        checked: outcome.checked,
        passed: outcome.passed,
        failed: outcome.failed,
        definition: {
          code: outcome.rule.code,
          title: outcome.rule.title,
          dimension: outcome.rule.dimension,
          severity: outcome.rule.severity,
          parameters: outcome.rule.parameters,
        },
      },
    });
    for (const row of outcome.failures)
      issues.push({
        runId: run.id,
        ruleId: outcome.rule.id,
        stagingId: staging.get(`${row.source}:${row.sourceId}`),
        severity: outcome.rule.severity,
        status: row.intrinsicErrors.length
          ? "QUARANTINED"
          : outcome.rule.code === "tenant_unique" && row.duplicate
            ? "RESOLVED"
            : "OPEN",
        message: `${outcome.rule.title}. Source record needs review.`,
        note:
          outcome.rule.code === "tenant_unique" && row.duplicate
            ? "Automatically deduplicated using the tenant identity, unit and lease interval. The observed failed check remains in this run's score."
            : null,
      });
  }
  if (issues.length) await tx.qualityIssue.createMany({ data: issues });
  const warehouse = await load(tx, run.id, rows, now);
  for (const source of sources) {
    const batch = rows.filter((r) => r.source === source);
    await tx.pipelineStageLog.create({
      data: {
        runId: run.id,
        source,
        stage: "TRANSFORM",
        rowCount: batch.length,
        message:
          "Names, unit codes, dates and statuses normalized; uncertain input retained for review.",
      },
    });
    await tx.pipelineStageLog.create({
      data: {
        runId: run.id,
        source,
        stage: "LOAD",
        rowCount: batch.filter((r) => !r.intrinsicErrors.length && !r.duplicate)
          .length,
        message: `${batch.filter((r) => r.intrinsicErrors.length).length} quarantined; ${batch.filter((r) => !r.intrinsicErrors.length && r.duplicate).length} deduplicated.`,
      },
    });
  }
  const result = await tx.pipelineRun.update({
    where: { id: run.id },
    data: {
      status:
        emptySource || quarantined || outcomes.some((o) => o.failed)
          ? "PARTIAL"
          : "SUCCEEDED",
      finishedAt: new Date(),
      extracted: rows.length,
      loaded,
      quarantined,
      deduplicated,
    },
  });
  await tx.auditLog.create({
    data: {
      actorId: actor.userId,
      ip: actor.ip,
      action: "PIPELINE_FINISHED",
      entity: "PipelineRun",
      entityId: run.id,
      after: {
        extracted: rows.length,
        loaded,
        quarantined,
        deduplicated,
        warehouse,
      },
    },
  });
  return result;
}
export async function runPipeline(
  db: PrismaClient,
  actor: Actor,
  now = new Date(),
) {
  try {
    return await db.$transaction(
      async (tx) => {
        await authorize(tx, actor, "pipeline:run");
        await lockPipeline(tx);
        return pipelineWork(tx, actor, now);
      },
      { timeout: 120000, maxWait: 5000 },
    );
  } catch (error) {
    if (error instanceof ApiError && [401, 403, 409].includes(error.status))
      throw error;
    const failed = await db.pipelineRun.create({
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        error: error instanceof ApiError ? error.code : "PIPELINE_FAILED",
      },
    });
    await db.auditLog.create({
      data: {
        actorId: actor.userId,
        ip: actor.ip,
        action: "PIPELINE_FAILED",
        entity: "PipelineRun",
        entityId: failed.id,
        after: { code: failed.error },
      },
    });
    throw new ApiError(
      500,
      "PIPELINE_FAILED",
      "The pipeline failed and its changes were rolled back. Inspect the failed run.",
    );
  }
}
