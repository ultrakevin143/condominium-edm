import type { Prisma } from "@prisma/client";
import type { Extracted, Payload, Source } from "./transform.js";
export function sourcePayload(row: object): Payload {
  const payload: Payload = {};
  for (const [key, value] of Object.entries(row))
    if (key !== "id" && !(key === "sourceUpdatedAt" && value === null))
      payload[key] =
        value === null
          ? null
          : value instanceof Date
            ? value.toISOString()
            : String(value);
  return payload;
}
function pack(source: Source, rows: object[]): Extracted[] {
  return rows.map((row) => {
    const payload = sourcePayload(row);
    return { source, sourceId: payload.externalId!, payload };
  });
}
export const adapters = {
  tenancy: async (tx: Prisma.TransactionClient) =>
    pack(
      "tenancy",
      await tx.sourceTenancy.findMany({ orderBy: { externalId: "asc" } }),
    ),
  billing: async (tx: Prisma.TransactionClient) =>
    pack(
      "billing",
      await tx.sourceBilling.findMany({ orderBy: { externalId: "asc" } }),
    ),
  maintenance: async (tx: Prisma.TransactionClient) =>
    pack(
      "maintenance",
      await tx.sourceMaintenance.findMany({ orderBy: { externalId: "asc" } }),
    ),
  visitor_log: async (tx: Prisma.TransactionClient) =>
    pack(
      "visitor_log",
      await tx.sourceVisitorLog.findMany({ orderBy: { externalId: "asc" } }),
    ),
};
