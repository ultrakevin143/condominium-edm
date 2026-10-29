import type { PrismaClient } from "@prisma/client";
import { authorize } from "../../middleware/permissions.js";
import type { Actor } from "../../shared/context.js";
import { ApiError } from "../../shared/errors.js";
import { protectRecord, recordRead } from "./access.js";

export async function tenantList(
  db: PrismaClient,
  actor: Actor,
  query: { q?: string; page: number; limit: number },
) {
  return db.$transaction(async (tx) => {
    const user = await authorize(tx, actor, "tenants:read");
    const catalog = await tx.fieldClassification.findMany();
    const where = query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" as const } },
            { externalId: { contains: query.q, mode: "insensitive" as const } },
            {
              leases: {
                some: {
                  unit: {
                    code: { contains: query.q, mode: "insensitive" as const },
                  },
                },
              },
            },
          ],
        }
      : {};
    const rows = await tx.tenant.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: query.limit,
      skip: (query.page - 1) * query.limit,
      include: { leases: { include: { unit: true } } },
    });
    const total = await tx.tenant.count({ where });
    const items = rows.map((row) => {
      const { leases, ...scalar } = row;
      return {
        ...protectRecord(user, catalog, "Tenant", scalar),
        units: leases.map((l) => protectRecord(user, catalog, "Unit", l.unit)),
      };
    });
    const categories = catalog
      .filter(
        (c) =>
          c.entity === "Tenant" &&
          ["CONFIDENTIAL", "RESTRICTED"].includes(c.classification),
      )
      .filter((c) =>
        user.role.permissions.includes(
          c.classification === "CONFIDENTIAL"
            ? "finance:read"
            : "visitors:read",
        ),
      )
      .map((c) => c.classification);
    await recordRead(
      tx,
      actor,
      "Tenant",
      rows.map((r) => r.id),
      categories,
    );
    return { items, total, page: query.page, limit: query.limit };
  });
}
export async function tenantDetail(db: PrismaClient, actor: Actor, id: string) {
  return db.$transaction(async (tx) => {
    const user = await authorize(tx, actor, "tenants:read");
    const catalog = await tx.fieldClassification.findMany();
    const tenant = await tx.tenant.findUnique({
      where: { id },
      include: { leases: { include: { unit: true } } },
    });
    if (!tenant) throw new ApiError(404, "NOT_FOUND", "Tenant not found.");
    const { leases, ...scalar } = tenant;
    const unitIds = [...new Set(leases.map((l) => l.unitId))];
    const dues = user.role.permissions.includes("finance:read")
      ? await tx.duesLedger.findMany({
          where: { unitId: { in: unitIds } },
          orderBy: { period: "desc" },
        })
      : [];
    const requests = await tx.maintenanceRequest.findMany({
      where: { unitId: { in: unitIds } },
      orderBy: { openedAt: "desc" },
    });
    const visitors = user.role.permissions.includes("visitors:read")
      ? await tx.visitorEntry.findMany({
          where: { unitId: { in: unitIds } },
          orderBy: { enteredAt: "desc" },
        })
      : [];
    const ids = [
      id,
      ...unitIds,
      ...leases.map((l) => l.id),
      ...dues.map((d) => d.id),
      ...requests.map((r) => r.id),
      ...visitors.map((v) => v.id),
    ];
    const provenance = await tx.fieldLineage.findMany({
      where: { entityId: { in: ids } },
      orderBy: { run: { startedAt: "desc" } },
      include: { run: { select: { id: true, startedAt: true, status: true } } },
    });
    const lineage = provenance.filter((row) => {
      if (
        row.source === "visitor_log" &&
        !user.role.permissions.includes("visitors:read")
      )
        return false;
      const entry = catalog.find(
        (c) => c.entity === row.entity && c.field === row.field,
      );
      if (!entry) return false;
      if (
        entry.classification === "CONFIDENTIAL" &&
        !user.role.permissions.includes("finance:read")
      )
        return false;
      if (
        entry.classification === "RESTRICTED" &&
        !user.role.permissions.includes("visitors:read")
      )
        return false;
      if (
        row.entity === "Tenant" &&
        ["email", "phone"].includes(row.field) &&
        user.role.code === "viewer"
      )
        return false;
      return true;
    });
    const categories: string[] = [];
    if (dues.length) categories.push("CONFIDENTIAL");
    if (visitors.length) categories.push("RESTRICTED");
    // Catalog upgrades can classify any displayed scalar, including tenant names.
    if (
      catalog.some(
        (c) =>
          ids.length &&
          ["CONFIDENTIAL", "RESTRICTED"].includes(c.classification) &&
          provenance.some(
            (l) => l.entity === c.entity && l.field === c.field,
          ) &&
          user.role.permissions.includes(
            c.classification === "CONFIDENTIAL"
              ? "finance:read"
              : "visitors:read",
          ),
      )
    )
      categories.push("CATALOG_CLASSIFIED");
    await recordRead(tx, actor, "TenantDetail", ids, categories);
    return {
      tenant: protectRecord(user, catalog, "Tenant", scalar),
      leases: leases.map((l) => {
        const { unit, ...rest } = l;
        return {
          ...protectRecord(user, catalog, "Lease", rest),
          unit: protectRecord(user, catalog, "Unit", unit),
        };
      }),
      dues: dues.map((d) => protectRecord(user, catalog, "DuesLedger", d)),
      requests: requests.map((r) =>
        protectRecord(user, catalog, "MaintenanceRequest", r),
      ),
      visitors: visitors.map((v) =>
        protectRecord(user, catalog, "VisitorEntry", v),
      ),
      access: {
        finance: user.role.permissions.includes("finance:read"),
        visitors: user.role.permissions.includes("visitors:read"),
      },
      lineage,
    };
  });
}
export async function unitList(
  db: PrismaClient,
  actor: Actor,
  query: { q?: string; page: number; limit: number },
) {
  return db.$transaction(async (tx) => {
    const user = await authorize(tx, actor, "tenants:read"),
      catalog = await tx.fieldClassification.findMany();
    const where = query.q
      ? { code: { contains: query.q, mode: "insensitive" as const } }
      : {};
    const rows = await tx.unit.findMany({
      where,
      orderBy: { code: "asc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    await recordRead(
      tx,
      actor,
      "Unit",
      rows.map((r) => r.id),
      catalog
        .filter(
          (c) =>
            c.entity === "Unit" &&
            ["RESTRICTED", "CONFIDENTIAL"].includes(c.classification),
        )
        .map((c) => c.classification),
    );
    return {
      items: rows.map((r) => protectRecord(user, catalog, "Unit", r)),
      total: await tx.unit.count({ where }),
      page: query.page,
      limit: query.limit,
    };
  });
}
