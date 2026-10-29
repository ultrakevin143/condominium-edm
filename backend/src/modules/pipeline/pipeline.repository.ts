import { Prisma } from "@prisma/client";
import {
  displayName,
  stableId,
  validEmail,
  ageDays,
  monthsOverdue,
  type Candidate,
} from "./transform.js";

type Tx = Prisma.TransactionClient;
function addLineage(
  records: Prisma.FieldLineageCreateManyInput[],
  runId: string,
  entity: string,
  entityId: string,
  fields: string[],
  row: Candidate,
  method = "source",
) {
  records.push(
    ...fields.map((field) => ({
      entity,
      entityId,
      field,
      source: row.source,
      sourceId: row.sourceId,
      runId,
      method,
    })),
  );
}
export async function load(
  tx: Tx,
  runId: string,
  rows: Candidate[],
  now: Date,
) {
  const lineageRecords: Prisma.FieldLineageCreateManyInput[] = [];
  const tenantCache = new Map<string, { id: string }>();
  const unitCache = new Map<string, { id: string }>();
  const keep = {
    tenant: new Set<string>(),
    unit: new Set<string>(),
    lease: new Set<string>(),
    dues: new Set<string>(),
    request: new Set<string>(),
    visitor: new Set<string>(),
  };
  const profiles = new Map<string, Candidate>();
  for (const row of rows) {
    if (
      row.source !== "tenancy" ||
      !row.identity ||
      row.intrinsicErrors.length > 0
    )
      continue;
    const current = profiles.get(row.identity);
    if (
      !current ||
      (current.intrinsicErrors.length > 0 && row.intrinsicErrors.length === 0)
    )
      profiles.set(row.identity, row);
  }
  const viable = rows.filter(
    (r) => r.intrinsicErrors.length === 0 && !r.duplicate,
  );
  for (const row of viable) {
    const p = row.payload,
      identity = row.identity!;
    const profile = profiles.get(identity)!;
    const tenantData = {
      externalId: identity,
      name: displayName(profile.payload.tenantName!),
      email: validEmail(profile.payload.email)
        ? profile.payload.email!.trim().toLowerCase()
        : null,
      phone: profile.payload.phone?.trim() || null,
    };
    let tenant = tenantCache.get(identity);
    if (!tenant) {
      tenant = await tx.tenant.upsert({
        where: { externalId: identity },
        create: { id: stableId(`tenant:${identity}`), ...tenantData },
        update: tenantData,
      });
      tenantCache.set(identity, tenant);
    }
    let unit = unitCache.get(row.unit!);
    if (!unit) {
      unit = await tx.unit.upsert({
        where: { code: row.unit! },
        create: { id: stableId(`unit:${row.unit}`), code: row.unit! },
        update: {},
      });
      unitCache.set(row.unit!, unit);
    }
    keep.tenant.add(tenant.id);
    keep.unit.add(unit.id);
    addLineage(
      lineageRecords,
      runId,
      "Tenant",
      tenant.id,
      ["id", "externalId", "name", "email", "phone"],
      profile,
      "normalized authoritative tenancy",
    );
    addLineage(
      lineageRecords,
      runId,
      "Unit",
      unit.id,
      ["id", "code"],
      row,
      "normalized unit code",
    );
    if (row.source === "tenancy") {
      const sourceKey = `tenancy:${identity}:${row.unit}:${row.date!.toISOString()}`;
      const data = {
        sourceKey,
        tenantId: tenant.id,
        unitId: unit.id,
        startDate: row.date!,
        endDate: row.endDate,
        status: row.status!,
      };
      const record = await tx.lease.upsert({
        where: { sourceKey },
        create: { id: stableId(sourceKey), ...data },
        update: data,
      });
      keep.lease.add(record.id);
      addLineage(
        lineageRecords,
        runId,
        "Lease",
        record.id,
        Object.keys(record),
        row,
        "normalized source",
      );
    } else if (row.source === "billing") {
      const sourceKey = `billing:${row.sourceId}`,
        data = {
          sourceKey,
          unitId: unit.id,
          period: p.period!,
          dueDate: row.date!,
          amountDue: p.amountDue!,
          amountPaid: p.amountPaid!,
          balance: new Prisma.Decimal(p.amountDue!).minus(p.amountPaid!),
          monthsOverdue: new Prisma.Decimal(p.amountDue!).greaterThan(
            p.amountPaid!,
          )
            ? monthsOverdue(row.date!, now)
            : 0,
        };
      const record = await tx.duesLedger.upsert({
        where: { sourceKey },
        create: { id: stableId(sourceKey), ...data },
        update: data,
      });
      keep.dues.add(record.id);
      addLineage(
        lineageRecords,
        runId,
        "DuesLedger",
        record.id,
        Object.keys(record).filter(
          (field) => !["balance", "monthsOverdue"].includes(field),
        ),
        row,
        "normalized source",
      );
      addLineage(
        lineageRecords,
        runId,
        "DuesLedger",
        record.id,
        ["balance", "monthsOverdue"],
        row,
        "derived from amountDue, amountPaid, dueDate and run reporting time",
      );
    } else if (row.source === "maintenance") {
      const sourceKey = `maintenance:${row.sourceId}`,
        data = {
          sourceKey,
          unitId: unit.id,
          description: p.description!.trim(),
          openedAt: row.date!,
          status: row.status!,
          daysOpen: row.status === "CLOSED" ? 0 : ageDays(row.date!, now),
        };
      const record = await tx.maintenanceRequest.upsert({
        where: { sourceKey },
        create: { id: stableId(sourceKey), ...data },
        update: data,
      });
      keep.request.add(record.id);
      addLineage(
        lineageRecords,
        runId,
        "MaintenanceRequest",
        record.id,
        Object.keys(record).filter((field) => field !== "daysOpen"),
        row,
        "normalized source",
      );
      addLineage(
        lineageRecords,
        runId,
        "MaintenanceRequest",
        record.id,
        ["daysOpen"],
        row,
        "derived from openedAt, status and run reporting time",
      );
    } else {
      const sourceKey = `visitor_log:${row.sourceId}`,
        data = {
          sourceKey,
          unitId: unit.id,
          visitorName: displayName(p.visitorName!),
          enteredAt: row.date!,
        };
      const record = await tx.visitorEntry.upsert({
        where: { sourceKey },
        create: { id: stableId(sourceKey), ...data },
        update: data,
      });
      keep.visitor.add(record.id);
      addLineage(
        lineageRecords,
        runId,
        "VisitorEntry",
        record.id,
        Object.keys(record),
        row,
        "normalized source",
      );
    }
  }
  // Missing or invalid source rows never delete previously accepted data.
  // Explicit removal must be a separately authorized, audited workflow.
  for (let index = 0; index < lineageRecords.length; index += 1000) {
    await tx.fieldLineage.createMany({
      data: lineageRecords.slice(index, index + 1000),
      skipDuplicates: true,
    });
  }
  return Object.fromEntries(
    Object.entries(keep).map(([key, ids]) => [key, ids.size]),
  );
}
