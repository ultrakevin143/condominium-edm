import test from "node:test";
import assert from "node:assert/strict";
import type { QualityRule } from "@prisma/client";
import { ruleDefinitions } from "../prisma/seed-data.js";
import { evaluate, qualityScore } from "../src/modules/quality/engine.js";
import { prepare, type Extracted } from "../src/modules/pipeline/transform.js";
const now = new Date("2026-10-28T10:00:00Z");
const clean: Extracted[] = [
  {
    source: "tenancy",
    sourceId: "t1",
    payload: {
      tenantId: "T1",
      tenantName: "Maria Santos",
      unitCode: "12A",
      leaseStart: "2026-01-01",
      status: "active",
      email: "maria@example.test",
      phone: "fictional",
    },
  },
  {
    source: "billing",
    sourceId: "b1",
    payload: {
      tenantId: "T1",
      tenantName: "MARIA SANTOS",
      unitCode: "12-A",
      dueDate: "2026-10-20",
      amountDue: "100",
      amountPaid: "100",
      period: "2026-10",
    },
  },
  {
    source: "maintenance",
    sourceId: "m1",
    payload: {
      tenantId: "T1",
      tenantName: "Maria S. Santos",
      unitCode: "Unit 12 A",
      openedAt: "2026-10-20",
      status: "open",
      description: "Fictional request",
    },
  },
];
const defects: Record<string, (rows: Extracted[]) => void> = {
  tenant_contact: (r) => {
    r[0]!.payload.phone = null;
  },
  lease_start: (r) => {
    r[0]!.payload.leaseStart = null;
  },
  date_validity: (r) => {
    r[0]!.payload.leaseStart = "31/02/2026";
  },
  unit_format: (r) => {
    r[1]!.payload.unitCode = "bad";
  },
  email_format: (r) => {
    r[0]!.payload.email = "bad";
  },
  nonnegative_amount: (r) => {
    r[1]!.payload.amountPaid = "-1";
  },
  tenant_unique: (r) => {
    r.push({ ...r[0]!, sourceId: "duplicate" });
  },
  active_lease: (r) => {
    r.push({
      ...r[0]!,
      sourceId: "conflict",
      payload: { ...r[0]!.payload, tenantId: "T2" },
    });
  },
  unit_reference: (r) => {
    r[1]!.payload.unitCode = "999Z";
  },
  name_consistency: (r) => {
    r[1]!.payload.tenantName = "Different Person";
  },
  overdue_dues: (r) => {
    r[1]!.payload.dueDate = "2026-01-01";
    r[1]!.payload.amountPaid = "0";
  },
  open_request: (r) => {
    r[2]!.payload.openedAt = "2026-01-01";
  },
  record_validity: (r) => {
    r[1]!.payload.period = "invalid";
  },
};
for (const definition of ruleDefinitions)
  test(`${definition.code} detects its targeted defect and passes clean input`, () => {
    const rule = {
      ...definition,
      id: definition.code,
      enabled: true,
    } as QualityRule;
    assert.equal(
      evaluate([rule], prepare(structuredClone(clean)), now)[0]!.failed,
      0,
    );
    const rows = structuredClone(clean);
    defects[definition.code]!(rows);
    const result = evaluate([rule], prepare(rows), now)[0]!;
    assert.ok(result.failed > 0);
    assert.equal(result.checked, result.failed + result.passed);
  });
test("score uses observation counts and no observations is unavailable", () => {
  assert.equal(qualityScore(0, 0), null);
  assert.equal(qualityScore(4, 1), 75);
});
