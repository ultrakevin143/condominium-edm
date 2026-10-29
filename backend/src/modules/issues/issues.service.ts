import type { PrismaClient } from "@prisma/client";
import { authorize } from "../../middleware/permissions.js";
import type { Actor } from "../../shared/context.js";
import { ApiError } from "../../shared/errors.js";
import { lockPipeline, pipelineWork } from "../pipeline/pipeline.service.js";
import {
  digest,
  sources,
  type Payload,
  type Source,
} from "../pipeline/transform.js";
import { correctionSchemas, issueActionSchema } from "./issues.schemas.js";
import { correctSource, sourceRow } from "./source.repository.js";

export async function actOnIssue(
  db: PrismaClient,
  actor: Actor,
  id: string,
  input: unknown,
  now = new Date(),
) {
  const data = issueActionSchema.parse(input);
  return db.$transaction(
    async (tx) => {
      const user = await authorize(tx, actor, "quality:manage");
      await lockPipeline(tx);
      const issue = await tx.qualityIssue.findUnique({
        where: { id },
        include: { staging: true, rule: true },
      });
      if (!issue?.staging)
        throw new ApiError(404, "NOT_FOUND", "Quality issue not found.");
      const source = issue.staging.source as Source;
      // Check this before status or freshness to avoid revealing whether a
      // guessed restricted issue exists or has already been reviewed.
      if (
        source === "visitor_log" &&
        !user.role.permissions.includes("visitors:read")
      )
        throw new ApiError(404, "NOT_FOUND", "Quality issue not found.");
      if (
        issue.updatedAt.toISOString() !== data.expectedUpdatedAt ||
        ["RESOLVED", "ACCEPTED"].includes(issue.status)
      )
        throw new ApiError(
          409,
          "STALE_ISSUE",
          "This issue was already updated. Reload it.",
        );
      if (!sources.includes(source))
        throw new ApiError(
          422,
          "UNSUPPORTED_SOURCE",
          "The source cannot be corrected here.",
        );
      // Quarantine changes the disposition of a classified billing record,
      // so it requires finance access even when prior warehouse data remains.
      if (
        source === "billing" &&
        data.action === "quarantine" &&
        !user.role.permissions.includes("finance:read")
      )
        throw new ApiError(
          403,
          "FORBIDDEN",
          "Your role cannot quarantine financial records.",
        );
      const latest = await tx.pipelineRun.findFirst({
        where: { status: { in: ["SUCCEEDED", "PARTIAL"] } },
        orderBy: [{ startedAt: "desc" }, { id: "desc" }],
        select: { id: true },
      });
      if (issue.runId !== latest?.id)
        throw new ApiError(
          409,
          "STALE_ISSUE",
          "This issue belongs to an older run. Open the latest run.",
        );
      const before = await sourceRow(tx, source, issue.staging.sourceId);
      if (!before || digest(before) !== digest(issue.staging.payload))
        throw new ApiError(
          409,
          "SOURCE_CHANGED",
          "The source has changed since this issue was recorded. Run the pipeline again.",
        );
      let runId: string | null = null;
      if (data.action === "fix") {
        const correction = correctionSchemas[source].parse(data.correction);
        if (!Object.keys(correction).length)
          throw new ApiError(
            422,
            "EMPTY_CORRECTION",
            "Supply at least one corrected field.",
          );
        if (
          source === "billing" &&
          Object.keys(correction).some((k) =>
            ["amountDue", "amountPaid"].includes(k),
          ) &&
          !user.role.permissions.includes("finance:read")
        )
          throw new ApiError(
            403,
            "FORBIDDEN",
            "Your role cannot change confidential financial values.",
          );
        await correctSource(
          tx,
          source,
          issue.staging.sourceId,
          correction as Record<string, string | null>,
        );
        await tx.sourceDisposition.deleteMany({
          where: { source, sourceId: issue.staging.sourceId },
        });
        const run = await pipelineWork(tx, actor, now);
        runId = run.id;
        const remaining = await tx.qualityIssue.count({
          where: {
            runId,
            ruleId: issue.ruleId,
            staging: { source, sourceId: issue.staging.sourceId },
          },
        });
        if (remaining)
          throw new ApiError(
            422,
            "ISSUE_NOT_FIXED",
            "This correction does not resolve the selected quality check. No changes were saved.",
          );
        await tx.auditLog.create({
          data: {
            actorId: actor.userId,
            ip: actor.ip,
            action: "SOURCE_CORRECTED",
            entity: source,
            entityId: issue.staging.sourceId,
            before,
            after: { ...before, ...correction },
          },
        });
      } else if (data.action === "quarantine") {
        await tx.sourceDisposition.upsert({
          where: {
            source_sourceId: { source, sourceId: issue.staging.sourceId },
          },
          create: {
            source,
            sourceId: issue.staging.sourceId,
            note: data.note,
            actorId: actor.userId,
          },
          update: { note: data.note, actorId: actor.userId },
        });
        runId = (await pipelineWork(tx, actor, now)).id;
      } else if (data.correction)
        throw new ApiError(
          422,
          "UNEXPECTED_CORRECTION",
          "Accepting an issue cannot change source data.",
        );
      const updated = await tx.qualityIssue.update({
        where: { id },
        data: {
          status:
            data.action === "fix"
              ? "RESOLVED"
              : data.action === "accept"
                ? "ACCEPTED"
                : "QUARANTINED",
          note: data.note,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          ip: actor.ip,
          action: "ISSUE_UPDATED",
          entity: "QualityIssue",
          entityId: id,
          before: { status: issue.status },
          after: {
            status: updated.status,
            note: data.note,
            verificationRunId: runId,
          },
        },
      });
      return { issue: updated, verificationRunId: runId };
    },
    { timeout: 120000, maxWait: 5000 },
  );
}

export async function issueDetail(db: PrismaClient, actor: Actor, id: string) {
  return db.$transaction(async (tx) => {
    const user = await authorize(tx, actor, "quality:manage");
    const issue = await tx.qualityIssue.findUnique({
      where: { id },
      include: { rule: true, staging: true },
    });
    if (!issue)
      throw new ApiError(404, "NOT_FOUND", "Quality issue not found.");
    if (
      (!issue.staging || issue.staging.source === "visitor_log") &&
      !user.role.permissions.includes("visitors:read")
    )
      throw new ApiError(404, "NOT_FOUND", "Quality issue not found.");
    const payload = { ...((issue.staging?.payload as Payload) ?? {}) };
    let classified = false;
    if (issue.staging?.source === "billing") {
      if (!user.role.permissions.includes("finance:read")) {
        delete payload.amountDue;
        delete payload.amountPaid;
      } else classified = true;
    }
    if (issue.staging?.source === "visitor_log") {
      classified = true;
    }
    if (classified)
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          ip: actor.ip,
          action: "CLASSIFIED_READ",
          entity: "QualityIssue",
          entityId: id,
        },
      });
    return {
      ...issue,
      staging: issue.staging ? { ...issue.staging, payload } : null,
    };
  });
}
