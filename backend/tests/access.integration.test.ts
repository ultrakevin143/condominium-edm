import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { assertLocalDatabase } from "../src/config/database-safety.js";
import { provisionAccess } from "../prisma/seed-data.js";
import { verifyPassword } from "../src/shared/security.js";

assertLocalDatabase(process.env.DATABASE_URL, true);
assertLocalDatabase(process.env.DIRECT_URL, true);
const db = new PrismaClient();
test("access-only provisioning is isolated from operational demo seeding", async (t) => {
  try {
    const password = process.env.SEED_PASSWORD!;
    await db.$transaction((tx) => provisionAccess(tx, password));
    await t.test(
      "accounts, rules and catalog exist without operational records",
      async () => {
        const users = await db.user.findMany({ include: { role: true } });
        assert.equal(users.length, 5);
        assert.ok(
          users.every(
            (user) =>
              user.active &&
              user.email === `${user.role.code}@bern.demo` &&
              verifyPassword(password, user.passwordHash),
          ),
        );
        assert.equal(await db.qualityRule.count(), 13);
        assert.ok((await db.fieldClassification.count()) > 0);
        for (const count of await Promise.all([
          db.sourceTenancy.count(),
          db.sourceBilling.count(),
          db.sourceMaintenance.count(),
          db.sourceVisitorLog.count(),
          db.tenant.count(),
          db.pipelineRun.count(),
        ]))
          assert.equal(count, 0);
      },
    );
    await t.test(
      "repeating access provisioning preserves account passwords and policy edits",
      async () => {
        const before = await db.user.findMany({
          orderBy: { id: "asc" },
          select: { id: true, passwordHash: true },
        });
        const policy = await db.policy.findFirstOrThrow();
        const edited = policy.description + " Locally verified policy edit.";
        await db.policy.update({
          where: { id: policy.id },
          data: { description: edited },
        });
        await db.$transaction((tx) =>
          provisionAccess(tx, "different-test-password-not-applied"),
        );
        assert.deepEqual(
          await db.user.findMany({
            orderBy: { id: "asc" },
            select: { id: true, passwordHash: true },
          }),
          before,
        );
        assert.equal(
          (await db.policy.findUniqueOrThrow({ where: { id: policy.id } }))
            .description,
          edited,
        );
        await db.policy.update({
          where: { id: policy.id },
          data: { description: policy.description },
        });
      },
    );
  } finally {
    await db.$disconnect();
  }
});
