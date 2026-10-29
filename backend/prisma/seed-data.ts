import type { Classification, Prisma, PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/shared/security.js";

export const roleDefinitions = {
  admin: {
    name: "Property manager",
    permissions: [
      "pipeline:run",
      "quality:read",
      "quality:manage",
      "governance:read",
      "governance:manage",
      "finance:read",
      "visitors:read",
      "audit:read",
      "tenants:read",
    ],
  },
  steward: {
    name: "Data steward",
    permissions: [
      "pipeline:run",
      "quality:read",
      "quality:manage",
      "governance:read",
      "tenants:read",
    ],
  },
  finance: {
    name: "Finance",
    permissions: ["quality:read", "finance:read", "tenants:read"],
  },
  frontdesk: {
    name: "Front desk / Security",
    permissions: ["visitors:read", "tenants:read"],
  },
  viewer: { name: "Viewer", permissions: ["quality:read", "tenants:read"] },
} as const;

export const tenantNames = [
  "Maria Santos",
  "Jomari Andales",
  "John Degamo",
  "Kevin Mercado",
  "Bern Tajanlangit",
  "Gerald Litang",
  "Ana Reyes",
  "Jose Ramos",
  "Liza Cruz",
  "Ramon Flores",
  "Grace Bautista",
  "Paolo Garcia",
  "Mia Mendoza",
  "Lorenzo Aquino",
  "Bea Torres",
  "Carlo Villanueva",
  "Nina Castillo",
  "Marco Rivera",
  "Karla Bautista",
  "Ella Navarro",
  "Rico Lim",
  "Iris Tan",
  "Noel Garcia",
  "Dina Ramos",
  "Lara Cruz",
  "Tomas Reyes",
  "Joy Flores",
  "Arnel Santos",
  "Vera Mendoza",
  "Leo Tan",
];

// The next phase dispatches these rule codes through one engine. Thresholds
// belong to rule rows so they can be inspected alongside the saved results.
export const ruleDefinitions = [
  {
    code: "record_validity",
    title: "Record meets canonical loading requirements",
    dimension: "validity",
    severity: "error",
    parameters: {},
  },
  {
    code: "tenant_contact",
    title: "Tenant contact details are complete",
    dimension: "completeness",
    severity: "warning",
    parameters: {},
  },
  {
    code: "lease_start",
    title: "Lease start date is present",
    dimension: "completeness",
    severity: "error",
    parameters: {},
  },
  {
    code: "date_validity",
    title: "Dates use a supported valid calendar date",
    dimension: "validity",
    severity: "error",
    parameters: {},
  },
  {
    code: "unit_format",
    title: "Unit code can be normalized",
    dimension: "validity",
    severity: "error",
    parameters: {},
  },
  {
    code: "email_format",
    title: "Email address has a valid format",
    dimension: "validity",
    severity: "warning",
    parameters: {},
  },
  {
    code: "nonnegative_amount",
    title: "Dues and paid amounts are nonnegative",
    dimension: "validity",
    severity: "error",
    parameters: {},
  },
  {
    code: "tenant_unique",
    title: "Tenancy source contains no duplicate person",
    dimension: "uniqueness",
    severity: "warning",
    parameters: {},
  },
  {
    code: "active_lease",
    title: "A unit has at most one active lease",
    dimension: "uniqueness",
    severity: "error",
    parameters: {},
  },
  {
    code: "unit_reference",
    title: "Referenced unit exists in tenancy",
    dimension: "consistency",
    severity: "error",
    parameters: {},
  },
  {
    code: "name_consistency",
    title: "Tenant names agree across sources",
    dimension: "consistency",
    severity: "warning",
    parameters: {},
  },
  {
    code: "overdue_dues",
    title: "Unpaid dues are no more than 90 days overdue",
    dimension: "timeliness",
    severity: "warning",
    parameters: { days: 90 },
  },
  {
    code: "open_request",
    title: "Open requests are no more than 30 days old",
    dimension: "timeliness",
    severity: "warning",
    parameters: { days: 30 },
  },
];

const warehouseFields: Record<string, { source: string; fields: string[] }> = {
  Tenant: {
    source: "tenancy",
    fields: ["id", "externalId", "name", "email", "phone"],
  },
  Unit: { source: "tenancy", fields: ["id", "code"] },
  Lease: {
    source: "tenancy",
    fields: [
      "id",
      "sourceKey",
      "tenantId",
      "unitId",
      "startDate",
      "endDate",
      "status",
    ],
  },
  DuesLedger: {
    source: "billing",
    fields: [
      "id",
      "sourceKey",
      "unitId",
      "period",
      "dueDate",
      "amountDue",
      "amountPaid",
      "balance",
      "monthsOverdue",
    ],
  },
  MaintenanceRequest: {
    source: "maintenance",
    fields: [
      "id",
      "sourceKey",
      "unitId",
      "description",
      "openedAt",
      "status",
      "daysOpen",
    ],
  },
  VisitorEntry: {
    source: "visitor_log",
    fields: ["id", "sourceKey", "unitId", "visitorName", "enteredAt"],
  },
};

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}
function dmy(date: Date) {
  return `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
}

// Shared account/catalog provisioning; fictional operational sources stay in seed().
export async function provisionAccess(
  tx: Prisma.TransactionClient,
  password: string,
) {
  if (password.length < 12)
    throw new Error("A private account password is required.");
  await tx.role.createMany({
    data: Object.entries(roleDefinitions).map(([code, definition]) => ({
      code,
      name: definition.name,
      permissions: [...definition.permissions],
    })),
    skipDuplicates: true,
  });
  const roles = await tx.role.findMany();
  await tx.user.createMany({
    data: Object.entries(roleDefinitions).map(([code, definition]) => ({
      email: code + "@bern.demo",
      name: "Demo " + definition.name,
      passwordHash: hashPassword(password),
      roleId: roles.find((role) => role.code === code)!.id,
    })),
    skipDuplicates: true,
  });
  await tx.qualityRule.createMany({
    data: ruleDefinitions,
    skipDuplicates: true,
  });
  const owner = await tx.dataOwner.upsert({
    where: { name: "Fictional condominium property management" },
    create: { name: "Fictional condominium property management" },
    update: {},
  });
  const policy = await tx.policy.upsert({
    where: { name: "Demonstration privacy policy" },
    create: {
      name: "Demonstration privacy policy",
      description:
        "Policy basis reference: Philippine Data Privacy Act (Republic Act No. 10173). Fictional educational data only; this prototype does not establish legal compliance. Amounts are limited to property managers and Finance. Visitor data is limited to property managers and Front desk/Security. Viewers receive masked tenant contact details.",
    },
    update: {},
  });
  const fields: Prisma.FieldClassificationCreateManyInput[] = [];
  for (const [entity, definition] of Object.entries(warehouseFields)) {
    for (const field of definition.fields) {
      let classification: Classification =
        entity === "VisitorEntry" ? "RESTRICTED" : "INTERNAL";
      if (
        entity === "DuesLedger" &&
        ["amountDue", "amountPaid", "balance"].includes(field)
      )
        classification = "CONFIDENTIAL";
      fields.push({
        entity,
        field,
        classification,
        source: definition.source,
        ownerId: owner.id,
        policyId: policy.id,
      });
    }
  }
  await tx.fieldClassification.createMany({
    data: fields,
    skipDuplicates: true,
  });
}

export function demoSources(now = new Date()) {
  const tenancy: Prisma.SourceTenancyCreateManyInput[] = [];
  const billing: Prisma.SourceBillingCreateManyInput[] = [];
  const maintenance: Prisma.SourceMaintenanceCreateManyInput[] = [];
  const visitors: Prisma.SourceVisitorLogCreateManyInput[] = [];
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const months = Array.from(
    { length: 6 },
    (_, m) =>
      new Date(
        Date.UTC(
          monthStart.getUTCFullYear(),
          monthStart.getUTCMonth() - 6 + m,
          15,
        ),
      ),
  );
  const leaseStart = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - 8, 1),
  );
  for (const [i, name] of tenantNames.entries()) {
    const tenantId = `T${String(i + 1).padStart(3, "0")}`;
    const unitCode = i === 0 ? "12A" : `${i + 20}B`;
    tenancy.push({
      externalId: `tenancy-${i}`,
      tenantId,
      tenantName: name,
      unitCode: i === 6 ? "unit?" : unitCode,
      email: i === 1 ? "invalid-email" : `resident${i + 1}@example.test`,
      // Labelled demo contact values avoid inventing real contact details.
      phone:
        i === 2 ? null : `FICTIONAL-CONTACT-${String(i + 1).padStart(4, "0")}`,
      leaseStart:
        i === 3
          ? null
          : i === 7
            ? "31/02/2026"
            : i % 2
              ? dmy(leaseStart)
              : iso(leaseStart),
      status: i % 2 ? "ACTIVE" : "active",
    });
    for (const [m, date] of months.entries()) {
      const externalId = `billing-${i}-${m}`;
      billing.push({
        externalId,
        tenantId: i === 8 ? null : tenantId,
        tenantName: i === 0 ? "MARIA SANTOS" : name,
        unitCode: i === 0 ? "12-A" : unitCode,
        period: iso(date).slice(0, 7),
        dueDate: m % 2 ? dmy(date) : iso(date),
        amountDue: 3000 + (i % 4) * 500,
        amountPaid:
          i === 4 && m === 0
            ? -100
            : i % 3 === 0
              ? 0
              : i % 3 === 1
                ? 1500
                : 3000 + (i % 4) * 500,
      });
    }
  }
  for (const entry of [
    {
      externalId: "duplicate-maria",
      tenantId: "T001",
      tenantName: "  Maria   Santos ",
      unitCode: "12-A",
    },
    {
      externalId: "overlap-lease",
      tenantId: "T002",
      tenantName: "Jomari Andales",
      unitCode: "12A",
    },
  ])
    tenancy.push({
      ...entry,
      email: "resident1@example.test",
      phone: "FICTIONAL-CONTACT-0001",
      leaseStart: dmy(leaseStart),
      status: "active",
    });
  const oldest = months[0]!;
  billing.push({
    externalId: "missing-unit",
    tenantName: "Fictional resident",
    unitCode: "999Z",
    period: iso(oldest).slice(0, 7),
    dueDate: iso(oldest),
    amountDue: 500,
    amountPaid: 0,
  });
  for (let i = 0; i < 12; i++) {
    const opened = new Date(now.getTime() - (i === 0 ? 46 : i + 1) * 86400000);
    maintenance.push({
      externalId: `request-${i + 1}`,
      tenantId: i === 0 ? "T001" : `T${String(i + 1).padStart(3, "0")}`,
      tenantName: i === 0 ? "Maria S. Santos" : tenantNames[i],
      unitCode: i === 0 ? "Unit 12 A" : `${i + 20}B`,
      description:
        i === 0
          ? "Fictional plumbing request"
          : `Fictional maintenance request ${i + 1}`,
      openedAt: i % 2 ? dmy(opened) : iso(opened),
      status: i % 3 === 0 ? "open" : "CLOSED",
    });
    visitors.push({
      externalId: `visit-${i + 1}`,
      tenantId: i === 0 ? "T001" : `T${String(i + 1).padStart(3, "0")}`,
      tenantName: i === 0 ? "Maria Santos" : tenantNames[i],
      unitCode: i === 0 ? "12-A" : `${i + 20}B`,
      visitorName: `Fictional visitor ${i + 1}`,
      enteredAt: new Date(now.getTime() - i * 86400000).toISOString(),
    });
  }

  return { tenancy, billing, maintenance, visitors };
}

export async function insertDemoSources(
  tx: Prisma.TransactionClient,
  now = new Date(),
) {
  const data = demoSources(now);
  const tenancy = await tx.sourceTenancy.createMany({
    data: data.tenancy,
    skipDuplicates: true,
  });
  const billing = await tx.sourceBilling.createMany({
    data: data.billing,
    skipDuplicates: true,
  });
  const maintenance = await tx.sourceMaintenance.createMany({
    data: data.maintenance,
    skipDuplicates: true,
  });
  const visitors = await tx.sourceVisitorLog.createMany({
    data: data.visitors,
    skipDuplicates: true,
  });
  return {
    tenancy: tenancy.count,
    billing: billing.count,
    maintenance: maintenance.count,
    visitors: visitors.count,
  };
}

export async function seed(
  db: PrismaClient,
  password: string,
  now = new Date(),
) {
  if (password.length < 12)
    throw new Error(
      "A private seed password of at least 12 characters is required.",
    );
  // Transaction makes initial provisioning atomic. Reruns preserve later edits,
  // account passwords and issue-remediation work rather than overwriting them.
  await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(6281049)`;
      await provisionAccess(tx, password);
      await insertDemoSources(tx, now);
    },
    { timeout: 60000 },
  );
}
