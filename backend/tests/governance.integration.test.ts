import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { assertLocalDatabase } from "../src/config/database-safety.js";
import { createApp } from "../src/app.js";
assertLocalDatabase(process.env.DATABASE_URL, true);
const db = new PrismaClient(),
  origin = "http://localhost:3400",
  password = process.env.SEED_PASSWORD!;
test("classified warehouse reads and governance controls", async (t) => {
  try {
    const app = createApp(db, origin),
      admin = request.agent(app),
      finance = request.agent(app),
      viewer = request.agent(app),
      front = request.agent(app),
      steward = request.agent(app);
    for (const [code, agent] of [
      ["admin", admin],
      ["finance", finance],
      ["viewer", viewer],
      ["frontdesk", front],
      ["steward", steward],
    ] as const)
      await agent
        .post("/auth/login")
        .set("Origin", origin)
        .send({ email: `${code}@bern.demo`, password })
        .expect(200);
    const maria = await db.tenant.findUniqueOrThrow({
        where: { externalId: "T001" },
      }),
      url = `/warehouse/tenants/${maria.id}`;
    await t.test(
      "all five accounts enforce their role matrix through direct API calls",
      async () => {
        for (const [
          role,
          agent,
          quality,
          issues,
          financeAccess,
          visitorAccess,
        ] of [
          ["admin", admin, true, true, true, true],
          ["steward", steward, true, true, false, false],
          ["finance", finance, true, false, true, false],
          ["frontdesk", front, false, false, false, true],
          ["viewer", viewer, true, false, false, false],
        ] as const) {
          const profile = (await agent.get("/auth/me").expect(200)).body.data;
          assert.equal(profile.role, role);
          const detail = (await agent.get(url).expect(200)).body.data;
          assert.equal(
            detail.dues.length > 0,
            financeAccess,
            `${role} amounts`,
          );
          assert.equal(
            detail.visitors.length > 0,
            visitorAccess,
            `${role} visitors`,
          );
          await agent.get("/account/security").expect(200);
          await agent.get("/governance/catalog").expect(200);
          await agent.get("/quality/history").expect(quality ? 200 : 403);
          await agent.get("/pipeline/runs").expect(quality ? 200 : 403);
          await agent.get("/issues").expect(issues ? 200 : 403);
          await agent
            .get("/governance/users")
            .expect(role === "admin" ? 200 : 403);
          await agent
            .get("/governance/audit")
            .expect(role === "admin" ? 200 : 403);
          if (!issues)
            await agent
              .post("/pipeline/runs")
              .set("Origin", origin)
              .send({})
              .expect(403);
          if (role !== "admin")
            await agent
              .post(`/account/users/${maria.id}/recovery-code`)
              .set("Origin", origin)
              .send({})
              .expect(403);
          assert.equal("passwordHash" in profile, false);
          assert.equal("securityAnswerHash" in profile, false);
        }
      },
    );
    await t.test(
      "Admin, Finance and Viewer receive different allowed fields",
      async () => {
        const a = (await admin.get(url).expect(200)).body.data,
          f = (await finance.get(url).expect(200)).body.data,
          v = (await viewer.get(url).expect(200)).body.data;
        assert.ok(a.dues.length && a.visitors.length);
        assert.ok(f.dues.length);
        assert.deepEqual(f.visitors, []);
        assert.deepEqual(v.dues, []);
        assert.deepEqual(v.visitors, []);
        assert.equal(v.tenant.email, "Masked");
        assert.equal(v.tenant.phone, "Masked");
        assert.notEqual(a.tenant.email, "Masked");
        assert.ok(
          !v.lineage.some(
            (l: { field: string; source: string }) =>
              ["amountDue", "amountPaid", "balance", "email", "phone"].includes(
                l.field,
              ) || l.source === "visitor_log",
          ),
        );
        const d = (await front.get(url).expect(200)).body.data;
        assert.ok(d.visitors.length);
        assert.deepEqual(d.dues, []);
        const list = (
          await viewer.get("/warehouse/tenants?q=Maria").expect(200)
        ).body.data;
        assert.equal(list.items[0].email, "Masked");
        await viewer.get("/warehouse/units?q=12-A").expect(200);
        await viewer.get("/warehouse/tenants?page=-1").expect(422);
        await viewer.get("/warehouse/tenants/bad-id").expect(422);
      },
    );
    await t.test(
      "authorized classified reads are persisted before a response",
      async () => {
        assert.ok(
          (await db.auditLog.count({
            where: {
              action: "CLASSIFIED_READ",
              entity: "TenantDetail",
              actorId: (
                await db.user.findUniqueOrThrow({
                  where: { email: "finance@bern.demo" },
                })
              ).id,
            },
          })) > 0,
        );
        await viewer.get("/governance/audit").expect(403);
        await finance.get("/governance/users").expect(403);
        await viewer.get("/governance/catalog").expect(200);
        const history = (
          await admin
            .get("/governance/audit?action=CLASSIFIED_READ")
            .expect(200)
        ).body.data;
        assert.ok(history.total > 0);
        assert.ok(
          history.items.every(
            (a: { action: string }) => a.action === "CLASSIFIED_READ",
          ),
        );
      },
    );
    await t.test(
      "policy edits require admin, a reason and the current description",
      async () => {
        const policy = await db.policy.findFirstOrThrow();
        const input = {
          description: policy.description + " Reviewed for the demonstration.",
          expectedDescription: policy.description,
          reason: "Reviewed the fictional property policy.",
        };
        await steward
          .patch(`/governance/policies/${policy.id}`)
          .set("Origin", origin)
          .send(input)
          .expect(403);
        await admin
          .patch(`/governance/policies/${policy.id}`)
          .set("Origin", origin)
          .send({ ...input, reason: "short" })
          .expect(422);
        await admin
          .patch(`/governance/policies/${policy.id}`)
          .set("Origin", origin)
          .send(input)
          .expect(200);
        await admin
          .patch(`/governance/policies/${policy.id}`)
          .set("Origin", origin)
          .send(input)
          .expect(409);
        assert.equal(
          await db.auditLog.count({
            where: { action: "POLICY_UPDATED", entityId: policy.id },
          }),
          1,
        );
      },
    );
    await t.test(
      "changing a role revokes sessions and changes visible data after login",
      async () => {
        const user = await db.user.findUniqueOrThrow({
            where: { email: "viewer@bern.demo" },
          }),
          role = await db.role.findUniqueOrThrow({
            where: { code: "finance" },
          });
        await admin
          .patch(`/governance/users/${user.id}/role`)
          .set("Origin", origin)
          .send({
            roleId: role.id,
            expectedRoleId: user.roleId,
            reason: "Demonstrate role-specific financial visibility.",
          })
          .expect(200);
        await viewer.get(url).expect(401);
        await viewer
          .post("/auth/login")
          .set("Origin", origin)
          .send({ email: user.email, password })
          .expect(200);
        assert.ok((await viewer.get(url).expect(200)).body.data.dues.length);
        await admin
          .patch(`/governance/users/${user.id}/role`)
          .set("Origin", origin)
          .send({
            roleId: user.roleId,
            expectedRoleId: role.id,
            reason: "Restore the fictional viewer role after verification.",
          })
          .expect(200);
        const me = await db.user.findUniqueOrThrow({
          where: { email: "admin@bern.demo" },
        });
        await admin
          .patch(`/governance/users/${me.id}/role`)
          .set("Origin", origin)
          .send({
            roleId: role.id,
            expectedRoleId: me.roleId,
            reason: "Self changes must be rejected safely.",
          })
          .expect(409);
      },
    );
  } finally {
    await db.$disconnect();
  }
});
