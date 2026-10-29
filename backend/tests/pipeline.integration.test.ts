import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { seed } from "../prisma/seed-data.js";
import { assertLocalDatabase } from "../src/config/database-safety.js";
import {
  runPipeline,
  pipelineLock,
} from "../src/modules/pipeline/pipeline.service.js";
import {
  actOnIssue,
  issueDetail,
} from "../src/modules/issues/issues.service.js";
import { qualityHistory } from "../src/modules/quality/quality.service.js";
import { createApp } from "../src/app.js";
import type { Actor } from "../src/shared/context.js";
import { ApiError } from "../src/shared/errors.js";

assertLocalDatabase(process.env.DATABASE_URL, true);
const db = new PrismaClient();
const password = process.env.SEED_PASSWORD!;
const now = new Date("2026-10-28T10:00:00Z");
const origin = "http://localhost:3400";
const rejectsCode = (code: string) => (error: unknown) =>
  error instanceof ApiError && error.code === code;

test("ETL, real quality snapshots and steward workflow", async (t) => {
  try {
    await seed(db, password, now);
    // Foundation tests leave one explicitly identified constraint-test record.
    const fixture = await db.tenant.findUnique({
      where: { externalId: "test-tenant" },
    });
    if (fixture) {
      await db.lease.deleteMany({ where: { tenantId: fixture.id } });
      await db.tenant.delete({ where: { id: fixture.id } });
    }
    await db.sourceTenancy.update({
      where: { externalId: "tenancy-1" },
      data: { email: "invalid-email" },
    });
    const users = await db.user.findMany({ include: { role: true } });
    const actor = (code: string): Actor => ({
      userId: users.find((u) => u.role.code === code)!.id,
      ip: "127.0.0.1",
    });
    const app = createApp(db, origin);
    let firstRunId = "";
    let previousCounts: Record<string, number> = {};
    async function counts() {
      return {
        tenant: await db.tenant.count(),
        unit: await db.unit.count(),
        lease: await db.lease.count(),
        dues: await db.duesLedger.count(),
        request: await db.maintenanceRequest.count(),
        visitor: await db.visitorEntry.count(),
      };
    }
    await t.test(
      "one run merges Maria across four sources, saves staging and lineage, and exposes real quality",
      async () => {
        const run = await runPipeline(db, actor("admin"), now);
        firstRunId = run.id;
        assert.equal(run.status, "PARTIAL");
        assert.equal(run.extracted, 237);
        assert.equal(
          run.extracted,
          run.loaded + run.quarantined + run.deduplicated,
        );
        assert.ok(run.quarantined > 0);
        assert.ok(run.deduplicated > 0);
        assert.equal(
          await db.stagingRow.count({ where: { runId: run.id } }),
          237,
        );
        assert.equal(
          await db.pipelineStageLog.count({ where: { runId: run.id } }),
          12,
        );
        assert.equal(
          await db.tenant.count({ where: { externalId: "T001" } }),
          1,
        );
        const maria = await db.tenant.findUniqueOrThrow({
          where: { externalId: "T001" },
        });
        assert.equal(maria.name, "Maria Santos");
        const unpaid = await db.duesLedger.findUniqueOrThrow({
          where: { sourceKey: "billing:billing-0-0" },
        });
        assert.equal(
          unpaid.balance.toString(),
          unpaid.amountDue.minus(unpaid.amountPaid).toString(),
        );
        assert.ok(unpaid.monthsOverdue >= 5);
        assert.ok(
          (
            await db.fieldLineage.findFirstOrThrow({
              where: {
                runId: run.id,
                entity: "DuesLedger",
                entityId: unpaid.id,
                field: "balance",
              },
            })
          ).method.startsWith("derived"),
        );
        assert.ok(
          (
            await db.maintenanceRequest.findUniqueOrThrow({
              where: { sourceKey: "maintenance:request-1" },
            })
          ).daysOpen >= 45,
        );
        assert.deepEqual(
          new Set(
            (
              await db.fieldLineage.findMany({
                where: { entity: "Tenant", entityId: maria.id, field: "name" },
              })
            ).map((r) => r.source),
          ),
          new Set(["tenancy"]),
        );
        const unit = await db.unit.findUniqueOrThrow({
          where: { code: "12-A" },
        });
        assert.deepEqual(
          new Set(
            (
              await db.fieldLineage.findMany({
                where: {
                  entity: "Unit",
                  entityId: unit.id,
                  field: "code",
                  runId: run.id,
                },
              })
            ).map((r) => r.source),
          ),
          new Set(["tenancy", "billing", "maintenance", "visitor_log"]),
        );
        const stages = await db.stagingRow.findMany({
          where: { runId: run.id, status: "QUARANTINED" },
        });
        assert.ok(stages.every((s) => s.reason));
        assert.equal(
          await db.duesLedger.count({
            where: { sourceKey: "billing:missing-unit" },
          }),
          0,
        );
        assert.equal(
          await db.duesLedger.count({ where: { amountPaid: { lt: 0 } } }),
          0,
        );
        const results = await db.qualityResult.findMany({
          where: { runId: run.id },
        });
        assert.equal(results.length, 13);
        assert.ok(results.filter((r) => r.failed > 0).length >= 6);
        const history = await qualityHistory(db);
        assert.ok(history[0]!.score !== null);
        assert.equal(history[0]!.change, null);
        previousCounts = await counts();
      },
    );
    await t.test(
      "running again keeps canonical IDs/counts and identical scores",
      async () => {
        const maria = await db.tenant.findUniqueOrThrow({
          where: { externalId: "T001" },
        });
        const run = await runPipeline(
          db,
          actor("steward"),
          new Date(now.getTime() + 1000),
        );
        assert.deepEqual(await counts(), previousCounts);
        assert.equal(
          (await db.tenant.findUniqueOrThrow({ where: { externalId: "T001" } }))
            .id,
          maria.id,
        );
        assert.equal((await qualityHistory(db))[0]!.change, 0);
        assert.equal(run.extracted, 237);
      },
    );
    await t.test(
      "fix requires a valid correction and keeps earlier scores immutable",
      async () => {
        const older = await db.qualityIssue.findFirstOrThrow({
          where: { rule: { code: "email_format" }, runId: firstRunId },
        });
        await assert.rejects(
          actOnIssue(db, actor("steward"), older.id, {
            action: "accept",
            note: "An older issue cannot be updated.",
            expectedUpdatedAt: older.updatedAt.toISOString(),
          }),
          rejectsCode("STALE_ISSUE"),
        );
        const latest = (await qualityHistory(db))[0]!;
        const issue = await db.qualityIssue.findFirstOrThrow({
          where: { rule: { code: "email_format" }, runId: latest.id },
        });
        const before = await db.qualityResult.findFirstOrThrow({
          where: { runId: latest.id, ruleId: issue.ruleId },
        });
        await assert.rejects(
          actOnIssue(
            db,
            actor("steward"),
            issue.id,
            {
              action: "fix",
              note: "An invalid correction must be rejected.",
              expectedUpdatedAt: issue.updatedAt.toISOString(),
              correction: { email: "still-bad" },
            },
            new Date(now.getTime() + 2000),
          ),
          rejectsCode("ISSUE_NOT_FIXED"),
        );
        const fixed = await actOnIssue(
          db,
          actor("steward"),
          issue.id,
          {
            action: "fix",
            note: "Corrected the fictional resident email.",
            expectedUpdatedAt: issue.updatedAt.toISOString(),
            correction: { email: "resident2@example.test" },
          },
          new Date(now.getTime() + 3000),
        );
        assert.equal(fixed.issue.status, "RESOLVED");
        assert.ok(fixed.verificationRunId);
        assert.equal(
          (
            await db.sourceTenancy.findUniqueOrThrow({
              where: { externalId: "tenancy-1" },
            })
          ).email,
          "resident2@example.test",
        );
        assert.equal(
          (
            await db.qualityResult.findUniqueOrThrow({
              where: { id: before.id },
            })
          ).failed,
          before.failed,
        );
        assert.equal(
          (
            await db.qualityResult.findFirstOrThrow({
              where: { runId: fixed.verificationRunId!, ruleId: issue.ruleId },
            })
          ).failed,
          0,
        );
        assert.ok((await qualityHistory(db))[0]!.change! > 0);
        await assert.rejects(
          actOnIssue(db, actor("steward"), issue.id, {
            action: "accept",
            note: "This stale edit must be rejected.",
            expectedUpdatedAt: issue.updatedAt.toISOString(),
          }),
          rejectsCode("STALE_ISSUE"),
        );
        assert.ok(
          (await db.auditLog.count({ where: { action: "SOURCE_CORRECTED" } })) >
            0,
        );
      },
    );
    await t.test(
      "accept changes the issue status without inventing a better score",
      async () => {
        const latest = (await qualityHistory(db))[0]!;
        const issue = await db.qualityIssue.findFirstOrThrow({
          where: {
            runId: latest.id,
            rule: { code: "overdue_dues" },
            status: "OPEN",
          },
        });
        await actOnIssue(db, actor("steward"), issue.id, {
          action: "accept",
          note: "Accepted for fictional demonstration review.",
          expectedUpdatedAt: issue.updatedAt.toISOString(),
        });
        const after = (await qualityHistory(db))[0]!;
        assert.equal(after.id, latest.id);
        assert.equal(after.score, latest.score);
      },
    );
    await t.test(
      "quarantine stops new loads while preserving previously accepted warehouse data",
      async () => {
        const latest = (await qualityHistory(db))[0]!;
        const issue = await db.qualityIssue.findFirstOrThrow({
          where: {
            runId: latest.id,
            rule: { code: "open_request" },
            status: "OPEN",
          },
          include: { staging: true },
        });
        const result = await actOnIssue(
          db,
          actor("steward"),
          issue.id,
          {
            action: "quarantine",
            note: "Excluded this request pending source review.",
            expectedUpdatedAt: issue.updatedAt.toISOString(),
          },
          new Date(now.getTime() + 4000),
        );
        assert.equal(
          await db.maintenanceRequest.count({
            where: { sourceKey: `maintenance:${issue.staging!.sourceId}` },
          }),
          1,
        );
        assert.equal(
          (
            await db.stagingRow.findFirstOrThrow({
              where: {
                runId: result.verificationRunId!,
                source: "maintenance",
                sourceId: issue.staging!.sourceId,
              },
            })
          ).status,
          "QUARANTINED",
        );
        assert.ok(
          (await db.stagingRow.count({
            where: { sourceId: issue.staging!.sourceId, source: "maintenance" },
          })) > 0,
        );
        assert.equal(
          (await db.qualityIssue.findUniqueOrThrow({ where: { id: issue.id } }))
            .status,
          "QUARANTINED",
        );
        assert.ok(result.verificationRunId);
      },
    );
    await t.test(
      "issue data and corrections respect financial and visitor restrictions",
      async () => {
        const latest = (await qualityHistory(db))[0]!;
        const issue = await db.qualityIssue.findFirstOrThrow({
          where: { runId: latest.id, rule: { code: "nonnegative_amount" } },
          include: { staging: true },
        });
        const detail = await issueDetail(db, actor("steward"), issue.id);
        assert.ok(
          !JSON.stringify(detail.staging!.payload).includes("amountPaid"),
        );
        await assert.rejects(
          actOnIssue(db, actor("steward"), issue.id, {
            action: "fix",
            note: "This role cannot edit the financial value.",
            expectedUpdatedAt: issue.updatedAt.toISOString(),
            correction: { amountPaid: "100" },
          }),
          rejectsCode("FORBIDDEN"),
        );
        const privileged = await issueDetail(db, actor("admin"), issue.id);
        assert.ok(
          JSON.stringify(privileged.staging!.payload).includes("amountPaid"),
        );
        assert.ok(
          (await db.auditLog.count({
            where: { action: "CLASSIFIED_READ", entityId: issue.id },
          })) > 0,
        );
        await assert.rejects(
          runPipeline(db, actor("viewer")),
          rejectsCode("FORBIDDEN"),
        );
      },
    );
    await t.test(
      "API validates requests and enforces sessions, roles and origins",
      async () => {
        await request(app)
          .post("/auth/login")
          .set("Origin", origin)
          .send({ email: "invalid" })
          .expect(422);
        await request(app).get("/quality/history").expect(401);
        await request(app)
          .post("/auth/login")
          .set("Origin", "https://untrusted.example")
          .send({})
          .expect(403);
        const admin = request.agent(app),
          viewer = request.agent(app);
        await admin
          .post("/auth/login")
          .set("Origin", origin)
          .send({ email: "admin@bern.demo", password })
          .expect(200);
        await viewer
          .post("/auth/login")
          .set("Origin", origin)
          .send({ email: "viewer@bern.demo", password })
          .expect(200);
        await viewer
          .post("/pipeline/runs")
          .set("Origin", origin)
          .send({})
          .expect(403);
        await viewer.get("/issues").expect(403);
        await viewer.get("/quality/history").expect(200);
        await admin.get("/pipeline/runs?page=0").expect(422);
        await admin.get("/pipeline/runs/not-a-uuid").expect(422);
        await admin
          .post("/pipeline/runs")
          .set("Origin", origin)
          .send({ arbitrary: true })
          .expect(422);
        const response = await admin
          .get("/issues?severity=warning&limit=2")
          .expect(200);
        assert.ok(response.body.data.items.length <= 2);
        assert.ok(
          response.body.data.items.every(
            (i: { severity: string }) => i.severity === "warning",
          ),
        );
        await admin
          .post("/auth/logout")
          .set("Origin", origin)
          .send({})
          .expect(200);
        await admin.get("/auth/me").expect(401);
      },
    );
    await t.test(
      "a busy pipeline rejects concurrent work without creating a fake failed run",
      async () => {
        const before = await db.pipelineRun.count();
        await db.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${pipelineLock})`;
          await assert.rejects(
            runPipeline(db, actor("admin")),
            rejectsCode("PIPELINE_BUSY"),
          );
        });
        assert.equal(await db.pipelineRun.count(), before);
      },
    );
    await t.test(
      "invalid rule configuration rolls back warehouse work and records failure",
      async () => {
        const rule = await db.qualityRule.findUniqueOrThrow({
          where: { code: "overdue_dues" },
        });
        const before = await counts();
        await db.qualityRule.update({
          where: { id: rule.id },
          data: { parameters: { days: -1 } },
        });
        await assert.rejects(
          runPipeline(db, actor("admin")),
          rejectsCode("PIPELINE_FAILED"),
        );
        assert.deepEqual(await counts(), before);
        assert.ok(
          (await db.pipelineRun.count({
            where: { status: "FAILED", error: "INVALID_RULE" },
          })) > 0,
        );
        await db.qualityRule.update({
          where: { id: rule.id },
          data: { parameters: rule.parameters! },
        });
      },
    );
    await t.test(
      "restricted visitor issues stay hidden even when stale or unclassified",
      async () => {
        const latest = (await qualityHistory(db))[0]!;
        const rule = await db.qualityRule.findUniqueOrThrow({
          where: { code: "record_validity" },
        });
        const staging = await db.stagingRow.findFirstOrThrow({
          where: { runId: latest.id, source: "visitor_log" },
        });
        const issue = await db.qualityIssue.create({
          data: {
            runId: latest.id,
            ruleId: rule.id,
            stagingId: staging.id,
            severity: "warning",
            message: "Restricted fixture",
            status: "RESOLVED",
          },
        });
        const unclassified = await db.qualityIssue.create({
          data: {
            runId: latest.id,
            ruleId: rule.id,
            severity: "warning",
            message: "Unclassified fixture",
          },
        });
        await assert.rejects(
          issueDetail(db, actor("steward"), issue.id),
          rejectsCode("NOT_FOUND"),
        );
        await assert.rejects(
          issueDetail(db, actor("steward"), unclassified.id),
          rejectsCode("NOT_FOUND"),
        );
        await assert.rejects(
          actOnIssue(db, actor("steward"), issue.id, {
            action: "accept",
            note: "Visitor record must remain hidden.",
            expectedUpdatedAt: issue.updatedAt.toISOString(),
          }),
          rejectsCode("NOT_FOUND"),
        );
        await issueDetail(db, actor("admin"), issue.id);
        assert.ok(
          (await db.auditLog.count({
            where: { action: "CLASSIFIED_READ", entityId: issue.id },
          })) > 0,
        );
        const steward = request.agent(app);
        await steward
          .post("/auth/login")
          .set("Origin", origin)
          .send({ email: "steward@bern.demo", password })
          .expect(200);
        const response = await steward
          .get(`/issues?runId=${latest.id}&limit=100`)
          .expect(200);
        assert.ok(
          response.body.data.items.every(
            (i: { staging: { source: string } | null }) =>
              i.staging && i.staging.source !== "visitor_log",
          ),
        );
      },
    );
    await t.test(
      "financial quarantine and changed source actions are rejected",
      async () => {
        const latest = (await qualityHistory(db))[0]!;
        const financial = await db.qualityIssue.findFirstOrThrow({
          where: { runId: latest.id, rule: { code: "nonnegative_amount" } },
        });
        await assert.rejects(
          actOnIssue(db, actor("steward"), financial.id, {
            action: "quarantine",
            note: "Financial quarantine requires explicit access.",
            expectedUpdatedAt: financial.updatedAt.toISOString(),
          }),
          rejectsCode("FORBIDDEN"),
        );
        const issue = await db.qualityIssue.findFirstOrThrow({
          where: {
            runId: latest.id,
            rule: { code: "tenant_contact" },
            status: "OPEN",
          },
          include: { staging: true },
        });
        const source = await db.sourceTenancy.findUniqueOrThrow({
          where: { externalId: issue.staging!.sourceId },
        });
        await db.sourceTenancy.update({
          where: { id: source.id },
          data: { phone: "CHANGED-FICTIONAL-CONTACT" },
        });
        for (const action of ["accept", "quarantine"] as const)
          await assert.rejects(
            actOnIssue(db, actor("steward"), issue.id, {
              action,
              note: "Changed source requires another evaluation.",
              expectedUpdatedAt: issue.updatedAt.toISOString(),
            }),
            rejectsCode("SOURCE_CHANGED"),
          );
        await db.sourceTenancy.update({
          where: { id: source.id },
          data: { phone: source.phone },
        });
      },
    );
    await t.test(
      "later invalid or missing input preserves accepted records and earlier provenance",
      async () => {
        const before = await counts();
        const lineage = await db.fieldLineage.findFirstOrThrow({
          where: { runId: firstRunId },
        });
        const bill = await db.sourceBilling.findUniqueOrThrow({
          where: { externalId: "billing-0-1" },
        });
        await db.sourceBilling.update({
          where: { id: bill.id },
          data: { amountPaid: -1 },
        });
        const removed = await db.sourceVisitorLog.findMany();
        await db.sourceVisitorLog.deleteMany();
        const run = await runPipeline(
          db,
          actor("admin"),
          new Date(now.getTime() + 5000),
        );
        assert.deepEqual(await counts(), before);
        assert.equal(
          (
            await db.fieldLineage.findUniqueOrThrow({
              where: { id: lineage.id },
            })
          ).runId,
          firstRunId,
        );
        assert.equal(run.status, "PARTIAL");
        const log = await db.pipelineStageLog.findFirstOrThrow({
          where: { runId: run.id, source: "visitor_log", stage: "EXTRACT" },
        });
        assert.equal(log.rowCount, 0);
        assert.ok(log.message?.includes("preserved"));
        assert.equal(
          (
            await db.stagingRow.findFirstOrThrow({
              where: {
                runId: run.id,
                source: "billing",
                sourceId: bill.externalId,
              },
            })
          ).status,
          "QUARANTINED",
        );
        await db.sourceBilling.update({
          where: { id: bill.id },
          data: { amountPaid: bill.amountPaid },
        });
        await db.sourceVisitorLog.createMany({ data: removed });
      },
    );
  } finally {
    await db.$disconnect();
  }
});
