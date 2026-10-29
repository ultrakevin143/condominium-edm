import test from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { seed } from "../prisma/seed-data.js";
import { assertLocalDatabase } from "../src/config/database-safety.js";
import { createApp } from "../src/app.js";

assertLocalDatabase(process.env.DATABASE_URL, true);
assert.equal(
  process.env.BERN_ACCEPTANCE_TEST,
  "true",
  "Use npm run test:acceptance.",
);
const db = new PrismaClient();
const origin = "http://localhost:3400";

test("instructor acceptance on a fresh fictional database", async (t) => {
  try {
    await seed(db, process.env.SEED_PASSWORD!);
    assert.equal(await db.pipelineRun.count(), 0);
    assert.equal(await db.tenant.count(), 0);
    const app = createApp(db, origin);
    const admin = request.agent(app),
      finance = request.agent(app),
      viewer = request.agent(app);
    for (const [role, agent] of [
      ["admin", admin],
      ["finance", finance],
      ["viewer", viewer],
    ] as const)
      await agent
        .post("/auth/login")
        .set("Origin", origin)
        .send({
          email: `${role}@bern.demo`,
          password: process.env.SEED_PASSWORD,
        })
        .expect(200);

    let runId = "";
    let initialScore = 0;
    const corrected: string[] = [];
    const cases = [
      {
        rule: "email_format",
        sourceId: "tenancy-1",
        correction: { email: "resident2@example.test" },
      },
      {
        rule: "tenant_contact",
        sourceId: "tenancy-2",
        correction: { phone: "FICTIONAL-VERIFIED-CONTACT" },
      },
      {
        rule: "lease_start",
        sourceId: "tenancy-3",
        correction: { leaseStart: "2026-02-01" },
      },
      {
        rule: "date_validity",
        sourceId: "tenancy-7",
        correction: { leaseStart: "2026-02-01" },
      },
      {
        rule: "unit_format",
        sourceId: "tenancy-6",
        correction: { unitCode: "26B" },
      },
      {
        rule: "nonnegative_amount",
        sourceId: "billing-4-0",
        correction: { amountPaid: "0" },
      },
    ];
    await t.test(
      "one pipeline reconciles all source rows and merges Maria",
      async () => {
        const run = (
          await admin
            .post("/pipeline/runs")
            .set("Origin", origin)
            .send({})
            .expect(201)
        ).body.data;
        runId = run.id;
        assert.equal(run.extracted, 237);
        assert.equal(
          run.extracted,
          run.loaded + run.quarantined + run.deduplicated,
        );
        assert.ok(run.quarantined > 0 && run.deduplicated > 0);
        const list = (await admin.get("/warehouse/tenants?q=Maria").expect(200))
          .body.data;
        assert.equal(list.total, 1);
        assert.equal(list.items[0].name, "Maria Santos");
        assert.deepEqual(
          list.items[0].units.map((unit: { code: string }) => unit.code),
          ["12-A"],
        );
        const detail = (
          await admin.get(`/warehouse/tenants/${list.items[0].id}`).expect(200)
        ).body.data;
        const sources = new Set(
          detail.lineage
            .filter(
              (row: { entity: string; field: string }) =>
                row.entity === "Unit" && row.field === "code",
            )
            .map((row: { source: string }) => row.source),
        );
        assert.deepEqual(
          sources,
          new Set(["tenancy", "billing", "maintenance", "visitor_log"]),
        );
        const snapshot = (await admin.get("/quality/history").expect(200)).body
          .data[0];
        assert.equal(snapshot.rules.length, 13);
        assert.ok(
          snapshot.rules.filter((rule: { failed: number }) => rule.failed > 0)
            .length >= 6,
        );
        assert.equal(typeof snapshot.score, "number");
        initialScore = snapshot.score;
      },
    );

    for (const example of cases)
      await t.test(
        `corrects and verifies ${example.rule} with an audit trail`,
        async () => {
          const list = (
            await admin
              .get(`/issues?rule=${example.rule}&runId=${runId}`)
              .expect(200)
          ).body.data;
          const issue = list.items.find(
            (item: { staging: { sourceId: string } }) =>
              item.staging.sourceId === example.sourceId,
          );
          assert.ok(issue, `Expected seeded issue ${example.rule}`);
          const detail = (await admin.get(`/issues/${issue.id}`).expect(200))
            .body.data;
          const result = (
            await admin
              .patch(`/issues/${issue.id}`)
              .set("Origin", origin)
              .send({
                action: "fix",
                expectedUpdatedAt: detail.updatedAt,
                note: `Verified fictional source correction for ${example.rule} during instructor acceptance.`,
                correction: example.correction,
              })
              .expect(200)
          ).body.data;
          assert.equal(result.issue.status, "RESOLVED");
          assert.ok(
            result.verificationRunId && result.verificationRunId !== runId,
          );
          runId = result.verificationRunId;
          const remaining = (
            await admin
              .get(`/issues?rule=${example.rule}&runId=${runId}`)
              .expect(200)
          ).body.data;
          assert.ok(
            !remaining.items.some(
              (item: { staging: { sourceId: string } }) =>
                item.staging.sourceId === example.sourceId,
            ),
          );
          assert.equal(
            await db.auditLog.count({
              where: { action: "ISSUE_UPDATED", entityId: issue.id },
            }),
            1,
          );
          assert.equal(
            await db.auditLog.count({
              where: { action: "SOURCE_CORRECTED", entityId: example.sourceId },
            }),
            1,
          );
          corrected.push(example.rule);
        },
      );

    await t.test(
      "the same tenant is protected for Admin, Finance and Viewer",
      async () => {
        const maria = await db.tenant.findUniqueOrThrow({
          where: { externalId: "T001" },
        });
        const path = `/warehouse/tenants/${maria.id}`;
        const a = (await admin.get(path).expect(200)).body.data;
        const f = (await finance.get(path).expect(200)).body.data;
        const v = (await viewer.get(path).expect(200)).body.data;
        assert.equal(a.tenant.id, f.tenant.id);
        assert.equal(a.tenant.id, v.tenant.id);
        assert.ok(a.dues.length > 0 && a.visitors.length > 0);
        assert.ok(f.dues.length > 0);
        assert.deepEqual(f.visitors, []);
        assert.deepEqual(v.dues, []);
        assert.deepEqual(v.visitors, []);
        assert.equal(v.tenant.email, "Masked");
        assert.equal(v.tenant.phone, "Masked");
        assert.ok(
          !v.lineage.some(
            (row: { field: string; source: string }) =>
              ["amountDue", "amountPaid", "balance", "email", "phone"].includes(
                row.field,
              ) || row.source === "visitor_log",
          ),
        );
        await viewer.get("/governance/audit").expect(403);
        await finance
          .post("/pipeline/runs")
          .set("Origin", origin)
          .send({})
          .expect(403);
        for (const role of ["admin", "finance"]) {
          const account = await db.user.findUniqueOrThrow({
            where: { email: `${role}@bern.demo` },
          });
          assert.ok(
            await db.auditLog.count({
              where: {
                action: "CLASSIFIED_READ",
                entity: "TenantDetail",
                actorId: account.id,
              },
            }),
          );
        }
      },
    );

    await t.test(
      "repeat loading preserves IDs and counts; scores and audits stay inspectable",
      async () => {
        const before = await db.tenant.findMany({
          orderBy: { id: "asc" },
          select: { id: true },
        });
        const count = async () => [
          await db.tenant.count(),
          await db.unit.count(),
          await db.lease.count(),
          await db.duesLedger.count(),
          await db.maintenanceRequest.count(),
          await db.visitorEntry.count(),
        ];
        const counts = await count();
        await admin
          .post("/pipeline/runs")
          .set("Origin", origin)
          .send({})
          .expect(201);
        assert.deepEqual(await count(), counts);
        assert.deepEqual(
          await db.tenant.findMany({
            orderBy: { id: "asc" },
            select: { id: true },
          }),
          before,
        );
        const history = (await admin.get("/quality/history").expect(200)).body
          .data;
        assert.ok(history[0].score > initialScore);
        assert.equal(history[0].change, 0);
        assert.equal(history.at(-1).score, initialScore);
        assert.equal(
          await db.auditLog.count({ where: { action: "PIPELINE_STARTED" } }),
          8,
        );
        assert.equal(
          await db.auditLog.count({ where: { action: "PIPELINE_FINISHED" } }),
          8,
        );
        const events = (
          await admin.get("/governance/audit?action=ISSUE_UPDATED").expect(200)
        ).body.data;
        assert.equal(events.total, 6);
        assert.ok(
          events.items.every(
            (event: { before: unknown; after: unknown }) =>
              event.before && event.after,
          ),
        );
        await writeFile(
          ".local/acceptance-results.txt",
          [
            "Bern instructor acceptance — local fictional data only",
            "PASS: 237 source rows reconciled; Maria is one tenant in unit 12-A with evidence from all four sources.",
            `PASS: six distinct corrections verified in new runs: ${corrected.join(", ")}.`,
            `PASS: actual quality score improved from ${initialScore}% to ${history[0].score}%; the original snapshot remains.`,
            "PASS: Admin, Finance and Viewer receive permitted fields for the same tenant; forbidden API actions are denied.",
            "PASS: repeated loading keeps warehouse IDs/counts; all eight runs and six corrections/decisions have audit entries.",
            "Browser policy, audit-detail and role screenshots are checked separately by the acceptance browser flow.",
            "No regular runtime database or Neon database was used.",
          ].join("\n") + "\n",
        );
      },
    );
  } finally {
    await db.$disconnect();
  }
});
