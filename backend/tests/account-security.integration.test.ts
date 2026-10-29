import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { assertLocalDatabase } from "../src/config/database-safety.js";
import { createApp } from "../src/app.js";
import {
  hashPassword,
  verifyPassword,
  newToken,
  tokenHash,
} from "../src/shared/security.js";
import { ApiError } from "../src/shared/errors.js";
import { login } from "../src/modules/auth/auth.service.js";
import {
  setSecurityQuestion,
  changePassword,
  assistRecovery,
  recoveryDetails,
  resetPassword,
} from "../src/modules/auth/account-security.service.js";
import { normalizeAnswer } from "../src/modules/auth/account-security.schemas.js";

assertLocalDatabase(process.env.DATABASE_URL, true);
assertLocalDatabase(process.env.DIRECT_URL, true);
const db = new PrismaClient(),
  origin = "http://localhost:3400";
const created: string[] = [],
  secretValues: string[] = [];
const note =
  "Verified this fictional requester against the isolated test identity record.";
const codeError = (code: string) => (error: unknown) =>
  error instanceof ApiError && error.code === code;
async function fixture(role = "viewer", configured = true) {
  const password = newToken(),
    answer = newToken();
  secretValues.push(password, answer);
  const definition = await db.role.findUniqueOrThrow({ where: { code: role } });
  const user = await db.user.create({
    data: {
      name: "Fictional security test",
      email: `${newToken().toLowerCase()}@example.test`,
      passwordHash: hashPassword(password),
      roleId: definition.id,
      ...(configured
        ? {
            securityQuestion: "What fictional nickname did you choose?",
            securityAnswerHash: hashPassword(normalizeAnswer(answer)),
          }
        : {}),
    },
  });
  created.push(user.id);
  return {
    user,
    password,
    answer,
    actor: { userId: user.id, ip: "127.0.0.1" },
  };
}
async function issue(
  admin: Awaited<ReturnType<typeof fixture>>,
  target: Awaited<ReturnType<typeof fixture>>,
  now = new Date(),
) {
  const value = await assistRecovery(
    db,
    admin.actor,
    target.user.id,
    {
      adminPassword: admin.password,
      adminAnswer: admin.answer,
      verificationNote: note,
    },
    "issue",
    now,
  );
  if (!("code" in value) || typeof value.code !== "string")
    throw new Error("Expected a private recovery code.");
  secretValues.push(value.code);
  return value.code;
}

test("password change and administrator-assisted recovery resist bypasses", async (t) => {
  try {
    await t.test(
      "every role can enroll a question, change its own password and sign out",
      async () => {
        for (const role of [
          "admin",
          "steward",
          "finance",
          "frontdesk",
          "viewer",
        ]) {
          const target = await fixture(role, false),
            replacement = newToken(),
            app = createApp(db, origin),
            agent = request.agent(app);
          secretValues.push(replacement);
          const signIn = async (value: string) => {
            const response = await agent
              .post("/auth/login")
              .set("Origin", origin)
              .send({ email: target.user.email, password: value })
              .expect(200);
            assert.equal(response.body.data.role, role);
          };
          await signIn(target.password);
          await agent
            .put("/account/security-question")
            .set("Origin", origin)
            .send({
              currentPassword: target.password,
              question: "What fictional nickname did you choose?",
              newAnswer: target.answer,
            })
            .expect(200);
          await agent.get("/account/security").expect(401);
          await signIn(target.password);
          await agent
            .post("/account/password")
            .set("Origin", origin)
            .send({
              currentPassword: target.password,
              answer: target.answer,
              newPassword: replacement,
            })
            .expect(200);
          await agent.get("/account/security").expect(401);
          await signIn(replacement);
          await agent
            .post("/auth/logout")
            .set("Origin", origin)
            .send({})
            .expect(200);
          await agent.get("/warehouse/tenants").expect(401);
          await agent
            .post("/auth/login")
            .set("Origin", origin)
            .send({ email: target.user.email, password: target.password })
            .expect(401);
        }
      },
    );
    await t.test(
      "question enrollment needs current credentials and revokes sessions",
      async () => {
        const target = await fixture("viewer", false),
          app = createApp(db, origin);
        const agent = request.agent(app);
        await agent
          .post("/auth/login")
          .set("Origin", origin)
          .send({ email: target.user.email, password: target.password })
          .expect(200);
        await request(app).get("/account/security").expect(401);
        await agent
          .post("/account/password")
          .set("Origin", origin)
          .send({ currentPassword: target.password, newPassword: newToken() })
          .expect(409);
        await agent
          .put("/account/security-question")
          .set("Origin", origin)
          .send({
            currentPassword: newToken(),
            question: "A fictional test question?",
            newAnswer: target.answer,
          })
          .expect(400);
        await agent
          .put("/account/security-question")
          .set("Origin", origin)
          .send({
            currentPassword: target.password,
            question: "A fictional test question?",
            newAnswer: target.answer,
            roleId: "injected",
          })
          .expect(422);
        await agent
          .put("/account/security-question")
          .set("Origin", origin)
          .send({
            currentPassword: target.password,
            question: "A fictional test question?",
            newAnswer: `  ${target.answer.toUpperCase()}  `,
          })
          .expect(200);
        await agent.get("/auth/me").expect(401);
        const stored = await db.user.findUniqueOrThrow({
          where: { id: target.user.id },
        });
        assert.ok(
          stored.securityAnswerHash &&
            verifyPassword(
              normalizeAnswer(target.answer),
              stored.securityAnswerHash,
            ),
        );
        assert.equal(
          await db.session.count({ where: { userId: target.user.id } }),
          0,
        );
        await assert.rejects(
          setSecurityQuestion(db, target.actor, {
            currentPassword: target.password,
            question: "Another fictional question?",
            newAnswer: newToken(),
          }),
          codeError("VERIFICATION_FAILED"),
        );
      },
    );
    await t.test(
      "password change checks the answer, preserves other accounts and revokes old sessions/codes",
      async () => {
        const target = await fixture(),
          other = await fixture(),
          admin = await fixture("admin");
        const first = await login(db, {
          email: target.user.email,
          password: target.password,
        });
        await login(db, {
          email: target.user.email,
          password: target.password,
        });
        const code = await issue(admin, target),
          next = newToken();
        secretValues.push(next);
        const input = {
          currentPassword: target.password,
          answer: target.answer,
          newPassword: next,
        };
        await assert.rejects(
          changePassword(db, target.actor, { ...input, answer: newToken() }),
          codeError("VERIFICATION_FAILED"),
        );
        await assert.rejects(
          changePassword(db, target.actor, {
            ...input,
            newPassword: target.password,
          }),
          codeError("PASSWORD_UNCHANGED"),
        );
        await changePassword(db, target.actor, {
          ...input,
          answer: ` ${target.answer.toUpperCase()} `,
        });
        assert.ok(
          verifyPassword(
            next,
            (await db.user.findUniqueOrThrow({ where: { id: target.user.id } }))
              .passwordHash,
          ),
        );
        assert.ok(
          verifyPassword(
            other.password,
            (await db.user.findUniqueOrThrow({ where: { id: other.user.id } }))
              .passwordHash,
          ),
        );
        await request(createApp(db, origin))
          .get("/auth/me")
          .set("Cookie", `bern_session=${first.token}`)
          .expect(401);
        assert.equal(
          await db.session.count({ where: { userId: target.user.id } }),
          0,
        );
        await assert.rejects(
          recoveryDetails(db, { email: target.user.email, code }),
          codeError("INVALID_RECOVERY"),
        );
        await assert.rejects(
          login(db, { email: target.user.email, password: target.password }),
          codeError("INVALID_LOGIN"),
        );
      },
    );
    await t.test(
      "verification attempts persist across app instances and lock after five failures",
      async () => {
        const target = await fixture(),
          input = {
            currentPassword: target.password,
            answer: newToken(),
            newPassword: newToken(),
          };
        for (let index = 0; index < 5; index++)
          await assert.rejects(
            changePassword(db, target.actor, input),
            codeError("VERIFICATION_FAILED"),
          );
        await assert.rejects(
          changePassword(db, target.actor, { ...input, answer: target.answer }),
          codeError("VERIFICATION_LOCKED"),
        );
        const stored = await db.user.findUniqueOrThrow({
          where: { id: target.user.id },
        });
        assert.equal(stored.securityFailures, 5);
        assert.ok(stored.securityLockedUntil);
        await changePassword(
          db,
          target.actor,
          { ...input, answer: target.answer },
          new Date(stored.securityLockedUntil.getTime() + 1),
        );
      },
    );
    await t.test(
      "recovery administration requires admin role, own question, reauthentication and another target",
      async () => {
        const admin = await fixture("admin"),
          unset = await fixture("admin", false),
          viewer = await fixture(),
          target = await fixture();
        const input = {
          adminPassword: admin.password,
          adminAnswer: admin.answer,
          verificationNote: note,
        };
        await assert.rejects(
          assistRecovery(db, viewer.actor, target.user.id, input, "issue"),
          codeError("FORBIDDEN"),
        );
        await assert.rejects(
          assistRecovery(db, admin.actor, admin.user.id, input, "issue"),
          codeError("SELF_RECOVERY"),
        );
        await assert.rejects(
          assistRecovery(
            db,
            unset.actor,
            target.user.id,
            { ...input, adminPassword: unset.password },
            "issue",
          ),
          codeError("QUESTION_REQUIRED"),
        );
        await assert.rejects(
          assistRecovery(
            db,
            admin.actor,
            target.user.id,
            { ...input, adminAnswer: newToken() },
            "issue",
          ),
          codeError("VERIFICATION_FAILED"),
        );
        const app = createApp(db, origin),
          agent = request.agent(app);
        await agent
          .post("/auth/login")
          .set("Origin", origin)
          .send({ email: viewer.user.email, password: viewer.password })
          .expect(200);
        await agent
          .post(`/account/users/${target.user.id}/recovery-code`)
          .set("Origin", origin)
          .send(input)
          .expect(403);
        await db.user.update({
          where: { id: target.user.id },
          data: { active: false },
        });
        await assert.rejects(
          assistRecovery(db, admin.actor, target.user.id, input, "issue"),
          codeError("NOT_FOUND"),
        );
      },
    );
    await t.test(
      "codes are hashed, email-bound, expiring and replaced on reissue",
      async () => {
        const admin = await fixture("admin"),
          target = await fixture(),
          other = await fixture(),
          now = new Date();
        const code = await issue(admin, target, now);
        const record = await db.passwordRecovery.findUniqueOrThrow({
          where: { tokenHash: tokenHash(code) },
        });
        assert.ok(record.tokenHash !== code);
        assert.equal(record.expiresAt.getTime() - now.getTime(), 15 * 60000);
        await assert.rejects(
          recoveryDetails(db, { email: other.user.email, code }),
          codeError("INVALID_RECOVERY"),
        );
        await assert.rejects(
          recoveryDetails(
            db,
            { email: target.user.email, code },
            record.expiresAt,
          ),
          codeError("INVALID_RECOVERY"),
        );
        const replacement = await issue(admin, target);
        await assert.rejects(
          recoveryDetails(db, { email: target.user.email, code }),
          codeError("INVALID_RECOVERY"),
        );
        assert.ok(
          (
            await recoveryDetails(db, {
              email: target.user.email,
              code: replacement,
            })
          ).question,
        );
      },
    );
    await t.test(
      "wrong recovery answers exhaust the persisted code-attempt budget",
      async () => {
        const admin = await fixture("admin"),
          target = await fixture(),
          code = await issue(admin, target);
        for (let index = 0; index < 5; index++)
          await assert.rejects(
            resetPassword(db, {
              email: target.user.email,
              code,
              answer: newToken(),
              newPassword: newToken(),
            }),
            codeError("INVALID_RECOVERY"),
          );
        await assert.rejects(
          resetPassword(db, {
            email: target.user.email,
            code,
            answer: target.answer,
            newPassword: newToken(),
          }),
          codeError("INVALID_RECOVERY"),
        );
        assert.equal(
          (
            await db.passwordRecovery.findUniqueOrThrow({
              where: { tokenHash: tokenHash(code) },
            })
          ).attempts,
          5,
        );
        assert.ok(
          verifyPassword(
            target.password,
            (await db.user.findUniqueOrThrow({ where: { id: target.user.id } }))
              .passwordHash,
          ),
        );
      },
    );
    await t.test(
      "concurrent redemption succeeds once, revokes sessions and rejects reuse",
      async () => {
        const admin = await fixture("admin"),
          target = await fixture();
        const old = await login(db, {
          email: target.user.email,
          password: target.password,
        });
        const code = await issue(admin, target),
          next = newToken();
        secretValues.push(next);
        const input = {
          email: target.user.email,
          code,
          answer: target.answer,
          newPassword: next,
        };
        const results = await Promise.allSettled([
          resetPassword(db, input),
          resetPassword(db, input),
        ]);
        assert.equal(
          results.filter((result) => result.status === "fulfilled").length,
          1,
        );
        assert.equal(
          await db.session.count({ where: { userId: target.user.id } }),
          0,
        );
        await request(createApp(db, origin))
          .get("/auth/me")
          .set("Cookie", `bern_session=${old.token}`)
          .expect(401);
        await assert.rejects(
          resetPassword(db, input),
          codeError("INVALID_RECOVERY"),
        );
        const signedIn = await login(db, {
          email: target.user.email,
          password: next,
        });
        assert.equal(signedIn.profile.role, "viewer");
      },
    );
    await t.test(
      "admin question reset clears a lost answer and invalidates previous access",
      async () => {
        const admin = await fixture("admin"),
          target = await fixture();
        await login(db, {
          email: target.user.email,
          password: target.password,
        });
        const oldCode = await issue(admin, target);
        await assistRecovery(
          db,
          admin.actor,
          target.user.id,
          {
            adminPassword: admin.password,
            adminAnswer: admin.answer,
            verificationNote: note,
          },
          "clear-question",
        );
        const stored = await db.user.findUniqueOrThrow({
          where: { id: target.user.id },
        });
        assert.equal(stored.securityAnswerHash, null);
        assert.equal(stored.securityQuestion, null);
        assert.equal(
          await db.session.count({ where: { userId: target.user.id } }),
          0,
        );
        await assert.rejects(
          recoveryDetails(db, { email: target.user.email, code: oldCode }),
          codeError("INVALID_RECOVERY"),
        );
        const code = await issue(admin, target),
          next = newToken();
        secretValues.push(next);
        await resetPassword(db, {
          email: target.user.email,
          code,
          newPassword: next,
        });
        await assert.rejects(
          changePassword(db, target.actor, {
            currentPassword: next,
            newPassword: newToken(),
          }),
          codeError("QUESTION_REQUIRED"),
        );
      },
    );
    await t.test(
      "role changes revoke recovery codes; stale-version sessions cannot authenticate",
      async () => {
        const admin = await fixture("admin"),
          target = await fixture(),
          code = await issue(admin, target);
        const app = createApp(db, origin),
          agent = request.agent(app);
        await agent
          .post("/auth/login")
          .set("Origin", origin)
          .send({ email: admin.user.email, password: admin.password })
          .expect(200);
        const finance = await db.role.findUniqueOrThrow({
          where: { code: "finance" },
        });
        await agent
          .patch(`/governance/users/${target.user.id}/role`)
          .set("Origin", origin)
          .send({
            roleId: finance.id,
            expectedRoleId: target.user.roleId,
            reason: note,
          })
          .expect(200);
        await assert.rejects(
          recoveryDetails(db, { email: target.user.email, code }),
          codeError("INVALID_RECOVERY"),
        );
        const stale = newToken();
        await db.session.create({
          data: {
            userId: target.user.id,
            tokenHash: tokenHash(stale),
            credentialVersion: 0,
            expiresAt: new Date(Date.now() + 60000),
          },
        });
        await request(app)
          .get("/auth/me")
          .set("Cookie", `bern_session=${stale}`)
          .expect(401);
      },
    );
    await t.test(
      "login racing a password change never leaves an old-password session",
      async () => {
        const target = await fixture(),
          next = newToken();
        secretValues.push(next);
        const results = await Promise.allSettled([
          changePassword(db, target.actor, {
            currentPassword: target.password,
            answer: target.answer,
            newPassword: next,
          }),
          login(db, { email: target.user.email, password: target.password }),
        ]);
        assert.equal(results[0]!.status, "fulfilled");
        assert.equal(
          await db.session.count({ where: { userId: target.user.id } }),
          0,
        );
      },
    );
    await t.test(
      "public recovery is rate limited and audits omit all credential values",
      async () => {
        const app = createApp(db, origin);
        for (let index = 0; index < 8; index++)
          await request(app)
            .post("/auth/recovery/details")
            .set("Origin", origin)
            .send({ email: "unknown@example.test", code: newToken() })
            .expect(400);
        await request(app)
          .post("/auth/recovery/details")
          .set("Origin", origin)
          .send({ email: "unknown@example.test", code: newToken() })
          .expect(429);
        const events = JSON.stringify(
          await db.auditLog.findMany({ where: { entityId: { in: created } } }),
        );
        assert.ok(secretValues.every((secret) => !events.includes(secret)));
        assert.ok(
          events.includes("PASSWORD_RECOVERED") &&
            events.includes("SECURITY_QUESTION_RESET"),
        );
      },
    );
  } finally {
    await db.user.deleteMany({ where: { id: { in: created } } });
    await db.$disconnect();
  }
});
