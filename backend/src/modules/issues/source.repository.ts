import type { Prisma } from "@prisma/client";
import type { Payload, Source } from "../pipeline/transform.js";

export async function sourceRow(
  tx: Prisma.TransactionClient,
  source: Source,
  externalId: string,
): Promise<Payload | null> {
  const row =
    source === "tenancy"
      ? await tx.sourceTenancy.findUnique({ where: { externalId } })
      : source === "billing"
        ? await tx.sourceBilling.findUnique({ where: { externalId } })
        : source === "maintenance"
          ? await tx.sourceMaintenance.findUnique({ where: { externalId } })
          : await tx.sourceVisitorLog.findUnique({ where: { externalId } });
  if (!row) return null;
  return Object.fromEntries(
    Object.entries(row)
      .filter(([k]) => k !== "id")
      .map(([k, v]) => [k, v === null ? null : String(v)]),
  );
}
export async function correctSource(
  tx: Prisma.TransactionClient,
  source: Source,
  externalId: string,
  data: Record<string, string | null>,
) {
  if (source === "tenancy")
    await tx.sourceTenancy.update({ where: { externalId }, data });
  else if (source === "billing")
    await tx.sourceBilling.update({ where: { externalId }, data });
  else if (source === "maintenance")
    await tx.sourceMaintenance.update({ where: { externalId }, data });
  else await tx.sourceVisitorLog.update({ where: { externalId }, data });
}
