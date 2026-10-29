import test from "node:test";
import assert from "node:assert/strict";
import { Prisma, PrismaClient } from "@prisma/client";
import { scryptSync } from "node:crypto";
import { seed } from "../prisma/seed-data.js";
import { assertLocalDatabase } from "../src/config/database-safety.js";

assertLocalDatabase(process.env.DATABASE_URL, true);
assertLocalDatabase(process.env.DIRECT_URL, true);
const db = new PrismaClient();
const password = process.env.SEED_PASSWORD;
if (!password) throw new Error("Isolated test password required.");

test("fresh local migration and fictional seed foundation", async (t) => {
  const now = new Date("2026-10-28T10:00:00Z");
  try {
    await seed(db, password, now);
    await t.test(
      "seeded accounts use the intended least-privilege roles and salted hashes",
      async () => {
        const users = await db.user.findMany({ include: { role: true } });
        assert.equal(users.length, 5);
        assert.equal(new Set(users.map((u) => u.passwordHash)).size, 5);
        for (const user of users) {
          assert.equal(user.email, `${user.role.code}@bern.demo`);
          const [algorithm, salt, hex] = user.passwordHash.split(":");
          assert.equal(algorithm, "scrypt");
          assert.equal(scryptSync(password, salt!, 64).toString("hex"), hex);
          assert.equal(user.active, true);
        }
        for (const user of users.filter((u) => u.role.code !== "admin"))
          assert.ok(!user.role.permissions.includes("governance:manage"));
        assert.deepEqual(
          users.find((u) => u.role.code === "viewer")!.role.permissions.sort(),
          ["quality:read", "tenants:read"],
        );
        assert.ok(
          !users
            .find((u) => u.role.code === "steward")!
            .role.permissions.includes("finance:read"),
        );
        assert.ok(
          !users
            .find((u) => u.role.code === "finance")!
            .role.permissions.includes("visitors:read"),
        );
      },
    );
    await t.test(
      "sources have 30 identities, six months of dues, and Maria in all four sources",
      async () => {
        const tenancy = await db.sourceTenancy.findMany();
        assert.equal(new Set(tenancy.map((r) => r.tenantId)).size, 30);
        assert.equal(tenancy.length, 32);
        const billing = await db.sourceBilling.findMany();
        assert.equal(billing.length, 181);
        assert.equal(
          new Set(
            billing.filter((r) => r.tenantId === "T001").map((r) => r.period),
          ).size,
          6,
        );
        assert.ok(billing.some((r) => r.amountPaid!.isNegative()));
        assert.ok(billing.some((r) => r.unitCode === "999Z"));
        assert.ok(tenancy.some((r) => r.phone === null));
        assert.ok(tenancy.some((r) => r.email === "invalid-email"));
        assert.ok(tenancy.some((r) => r.leaseStart === null));
        assert.ok(tenancy.some((r) => r.leaseStart === "31/02/2026"));
        assert.equal(
          await db.sourceMaintenance.count({
            where: { tenantId: "T001", tenantName: "Maria S. Santos" },
          }),
          1,
        );
        assert.equal(
          await db.sourceVisitorLog.count({ where: { tenantId: "T001" } }),
          1,
        );
        const request = await db.sourceMaintenance.findUniqueOrThrow({
          where: { externalId: "request-1" },
        });
        assert.ok(
          now.getTime() - Date.parse(request.openedAt!) > 45 * 86400000,
        );
        const mariaBill = billing.find((r) => r.externalId === "billing-0-0")!;
        assert.ok(
          now.getTime() - Date.parse(mariaBill.dueDate!) > 120 * 86400000,
        );
      },
    );
    await t.test(
      "warehouse and scores remain empty until a real pipeline runs",
      async () => {
        assert.equal(await db.tenant.count(), 0);
        assert.equal(await db.unit.count(), 0);
        assert.equal(await db.pipelineRun.count(), 0);
        assert.equal(await db.qualityResult.count(), 0);
      },
    );
    await t.test(
      "catalog covers warehouse scalar fields and restricts amounts and visitor data",
      async () => {
        const catalog = await db.fieldClassification.findMany({
          include: { owner: true, policy: true },
        });
        for (const model of Prisma.dmmf.datamodel.models.filter((m) =>
          [
            "Tenant",
            "Unit",
            "Lease",
            "DuesLedger",
            "MaintenanceRequest",
            "VisitorEntry",
          ].includes(m.name),
        )) {
          for (const field of model.fields.filter((f) => f.kind === "scalar")) {
            const row = catalog.find(
              (c) => c.entity === model.name && c.field === field.name,
            );
            assert.ok(
              row,
              `${model.name}.${field.name} needs catalog metadata`,
            );
            assert.ok(row.owner.name && row.policy.description && row.source);
          }
        }
        assert.equal(
          catalog.find(
            (c) => c.entity === "DuesLedger" && c.field === "balance",
          )!.classification,
          "CONFIDENTIAL",
        );
        assert.ok(
          catalog
            .filter((c) => c.entity === "VisitorEntry")
            .every((c) => c.classification === "RESTRICTED"),
        );
        assert.equal(await db.qualityRule.count(), 13);
        assert.equal(
          new Set((await db.qualityRule.findMany()).map((r) => r.dimension))
            .size,
          5,
        );
      },
    );
    await t.test(
      "rerunning seed preserves credentials, corrected source records and counts",
      async () => {
        const user = await db.user.findUniqueOrThrow({
          where: { email: "viewer@bern.demo" },
        });
        await db.sourceTenancy.update({
          where: { externalId: "tenancy-1" },
          data: { email: "corrected@example.test" },
        });
        await seed(db, password + "different", now);
        assert.equal(
          (await db.user.findUniqueOrThrow({ where: { id: user.id } }))
            .passwordHash,
          user.passwordHash,
        );
        assert.equal(
          (
            await db.sourceTenancy.findUniqueOrThrow({
              where: { externalId: "tenancy-1" },
            })
          ).email,
          "corrected@example.test",
        );
        assert.equal(await db.sourceTenancy.count(), 32);
        assert.equal(await db.sourceBilling.count(), 181);
        assert.equal(await db.sourceMaintenance.count(), 12);
        assert.equal(await db.sourceVisitorLog.count(), 12);
        assert.equal(await db.user.count(), 5);
      },
    );
    await t.test(
      "warehouse rejects bad amounts, unit codes and conflicting active leases",
      async () => {
        await assert.rejects(db.unit.create({ data: { code: "12A" } }));
        const unit = await db.unit.create({ data: { code: "12-A" } });
        await assert.rejects(
          db.duesLedger.create({
            data: {
              sourceKey: "invalid",
              unitId: unit.id,
              period: "2026-01",
              dueDate: now,
              amountDue: 100,
              amountPaid: -1,
            },
          }),
        );
        const tenant = await db.tenant.create({
          data: { externalId: "test-tenant", name: "Fictional tenant" },
        });
        await db.lease.create({
          data: {
            sourceKey: "first",
            unitId: unit.id,
            tenantId: tenant.id,
            startDate: now,
            status: "ACTIVE",
          },
        });
        await assert.rejects(
          db.lease.create({
            data: {
              sourceKey: "conflict",
              unitId: unit.id,
              tenantId: tenant.id,
              startDate: now,
              status: "active",
            },
          }),
        );
        await assert.rejects(
          db.lease.create({
            data: {
              sourceKey: "backwards",
              unitId: unit.id,
              tenantId: tenant.id,
              startDate: now,
              endDate: new Date("2020-01-01"),
              status: "CLOSED",
            },
          }),
        );
      },
    );
    await t.test(
      "audit accepts appends and rejects updates, deletes and truncation",
      async () => {
        const event = await db.auditLog.create({
          data: { action: "FOUNDATION_CHECK", entity: "test" },
        });
        await assert.rejects(
          db.auditLog.update({
            where: { id: event.id },
            data: { action: "CHANGED" },
          }),
        );
        await assert.rejects(db.auditLog.delete({ where: { id: event.id } }));
        await assert.rejects(
          db.$executeRawUnsafe('TRUNCATE TABLE "bern_hub"."bern_audit_log"'),
          (error: unknown) =>
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2010" &&
            error.meta?.code === "42501",
        );
        assert.equal(
          (await db.auditLog.findUniqueOrThrow({ where: { id: event.id } }))
            .action,
          "FOUNDATION_CHECK",
        );
      },
    );
  } finally {
    await db.$disconnect();
  }
});
