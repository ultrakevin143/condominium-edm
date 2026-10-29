import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeUnit,
  nameKey,
  displayName,
  parseDate,
  prepare,
  digest,
  monthsOverdue,
  type Extracted,
} from "../src/modules/pipeline/transform.js";
test("unit and person normalization reconciles the supplied variations", () => {
  for (const unit of ["12A", "12-A", "Unit 12 A"])
    assert.equal(normalizeUnit(unit), "12-A");
  for (const name of ["Maria Santos", "MARIA SANTOS", " Maria S. Santos "])
    assert.equal(nameKey(name), "maria santos");
  assert.equal(displayName(" MARIA  SANTOS "), "Maria Santos");
  assert.equal(normalizeUnit("12?A"), null);
});
test("date conversion rejects invalid calendars and treats slash dates as DD/MM/YYYY", () => {
  assert.equal(
    parseDate("15/04/2026")!.toISOString(),
    "2026-04-15T00:00:00.000Z",
  );
  for (const value of [
    "31/02/2026",
    "2026-02-30",
    "04/15/2026",
    "2026-02-30T10:00:00Z",
    "yesterday",
  ])
    assert.equal(parseDate(value), null);
  assert.equal(
    monthsOverdue(new Date("2026-01-15"), new Date("2026-04-14")),
    2,
  );
});
test("fallback matching requires a unique normalized name and unit; explicit IDs remain authoritative", () => {
  const row: Extracted = {
    source: "tenancy",
    sourceId: "t1",
    payload: {
      tenantId: "T1",
      tenantName: "Maria Santos",
      unitCode: "12A",
      leaseStart: "2026-01-01",
      status: "active",
    },
  };
  const bill: Extracted = {
    source: "billing",
    sourceId: "b1",
    payload: {
      tenantId: null,
      tenantName: "MARIA S. SANTOS",
      unitCode: "Unit 12 A",
      dueDate: "15/01/2026",
      amountDue: "100",
      amountPaid: "0",
      period: "2026-01",
    },
  };
  assert.equal(prepare([row, bill])[1]!.identity, "T1");
  const second = {
    ...row,
    sourceId: "t2",
    payload: { ...row.payload, tenantId: "T2" },
  };
  const historical = { ...row, payload: { ...row.payload, status: "closed" } };
  const otherHistorical = {
    ...second,
    payload: { ...second.payload, status: "closed" },
  };
  assert.equal(prepare([historical, otherHistorical, bill])[2]!.identity, null);
  assert.equal(
    prepare([
      row,
      { ...bill, payload: { ...bill.payload, tenantId: "unknown" } },
    ])[1]!.identity,
    null,
  );
});
test("source fingerprints ignore JSONB property order", () => {
  assert.equal(digest({ a: "one", b: "two" }), digest({ b: "two", a: "one" }));
});

test("unit codes preserve leading zeroes and reject oversized values", () => {
  assert.equal(normalizeUnit("001-A"), "001-A");
  assert.notEqual(normalizeUnit("001-A"), normalizeUnit("1-A"));
  assert.equal(normalizeUnit("123456789-A"), null);
});

test("fallback matching does not merge conflicting middle initials", () => {
  const tenant: Extracted = {
    source: "tenancy",
    sourceId: "t1",
    payload: {
      tenantId: "T1",
      tenantName: "Maria S. Santos",
      unitCode: "12A",
      leaseStart: "2026-01-01",
      status: "active",
    },
  };
  const bill: Extracted = {
    source: "billing",
    sourceId: "b1",
    payload: {
      tenantId: null,
      tenantName: "Maria T. Santos",
      unitCode: "12-A",
      dueDate: "2026-01-15",
      amountDue: "100",
      amountPaid: "0",
      period: "2026-01",
    },
  };
  assert.equal(prepare([tenant, bill])[1]!.identity, null);
});

test("explicit tenant ID does not authorize a different resident's unit", () => {
  const a: Extracted = {
    source: "tenancy",
    sourceId: "t1",
    payload: {
      tenantId: "T1",
      tenantName: "Maria Santos",
      unitCode: "12A",
      leaseStart: "2026-01-01",
      status: "active",
    },
  };
  const b: Extracted = {
    source: "tenancy",
    sourceId: "t2",
    payload: {
      tenantId: "T2",
      tenantName: "John Degamo",
      unitCode: "13A",
      leaseStart: "2026-01-01",
      status: "active",
    },
  };
  const bill: Extracted = {
    source: "billing",
    sourceId: "b1",
    payload: {
      tenantId: "T1",
      tenantName: "Maria Santos",
      unitCode: "13A",
      dueDate: "2026-01-15",
      amountDue: "100",
      amountPaid: "0",
      period: "2026-01",
    },
  };
  assert.match(
    prepare([a, b, bill])[2]!.intrinsicErrors.join(" "),
    /does not belong/,
  );
});

test("same lease with differing end dates is a conflict rather than a duplicate", () => {
  const original: Extracted = {
    source: "tenancy",
    sourceId: "t1",
    payload: {
      tenantId: "T1",
      tenantName: "Maria Santos",
      unitCode: "12A",
      leaseStart: "2026-01-01",
      leaseEnd: "2027-01-01",
      status: "active",
    },
  };
  const conflict = {
    ...original,
    sourceId: "t2",
    payload: { ...original.payload, leaseEnd: "2028-01-01" },
  };
  const result = prepare([original, conflict])[1]!;
  assert.equal(result.duplicate, false);
  assert.equal(result.leaseConflict, true);
});

test("quarantined tenancy records cannot claim units, match residents or block leases", () => {
  const excluded: Extracted = {
    source: "tenancy",
    sourceId: "t1",
    payload: {
      tenantId: "T1",
      tenantName: "Maria Santos",
      unitCode: "12A",
      leaseStart: "2026-01-01",
      status: "active",
    },
  };
  const allowed: Extracted = {
    source: "tenancy",
    sourceId: "t2",
    payload: {
      tenantId: "T2",
      tenantName: "John Degamo",
      unitCode: "12A",
      leaseStart: "2026-01-01",
      status: "active",
    },
  };
  const bill: Extracted = {
    source: "billing",
    sourceId: "b1",
    payload: {
      tenantId: "T1",
      tenantName: "Maria Santos",
      unitCode: "12A",
      dueDate: "2026-01-15",
      amountDue: "100",
      amountPaid: "0",
      period: "2026-01",
    },
  };
  const result = prepare([excluded, allowed, bill], new Set(["tenancy:t1"]));
  assert.match(result[0]!.intrinsicErrors.join(" "), /Quarantined/);
  assert.equal(result[1]!.leaseConflict, false);
  assert.equal(result[2]!.identity, null);
});

test("an invalid tenancy cannot validate other sources or block a valid lease", () => {
  const bad: Extracted = {
    source: "tenancy",
    sourceId: "bad",
    payload: {
      tenantId: "T1",
      tenantName: "Maria Santos",
      unitCode: "12A",
      leaseStart: "31/02/2026",
      status: "active",
    },
  };
  const good: Extracted = {
    source: "tenancy",
    sourceId: "good",
    payload: {
      tenantId: "T2",
      tenantName: "John Degamo",
      unitCode: "12A",
      leaseStart: "2026-01-01",
      status: "active",
    },
  };
  const bill: Extracted = {
    source: "billing",
    sourceId: "b1",
    payload: {
      tenantId: "T1",
      tenantName: "Maria Santos",
      unitCode: "12A",
      dueDate: "2026-01-15",
      amountDue: "100",
      amountPaid: "0",
      period: "2026-01",
    },
  };
  const result = prepare([bad, good, bill]);
  assert.ok(result[0]!.intrinsicErrors.length > 0);
  assert.equal(result[1]!.leaseConflict, false);
  assert.equal(result[2]!.identity, null);
});

test("conflicting names for one explicit tenant ID are quarantined", () => {
  const original: Extracted = {
    source: "tenancy",
    sourceId: "t1",
    payload: {
      tenantId: "T1",
      tenantName: "Maria Santos",
      unitCode: "12A",
      leaseStart: "2026-01-01",
      status: "active",
    },
  };
  const conflict = {
    ...original,
    sourceId: "t2",
    payload: {
      ...original.payload,
      tenantName: "Different Person",
      unitCode: "13A",
    },
  };
  const candidate = prepare([original, conflict])[1]!;
  assert.equal(candidate.nameMatches, false);
  assert.match(candidate.intrinsicErrors.join(" "), /name conflicts/);
});
