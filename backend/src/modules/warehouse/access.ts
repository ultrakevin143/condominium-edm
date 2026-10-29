import type { FieldClassification, Prisma } from "@prisma/client";
import { authorize } from "../../middleware/permissions.js";
import type { Actor } from "../../shared/context.js";

export type AccessUser = Awaited<ReturnType<typeof authorize>>;
export function fieldVisible(user: AccessUser, classification: string) {
  if (classification === "CONFIDENTIAL")
    return user.role.permissions.includes("finance:read");
  if (classification === "RESTRICTED")
    return user.role.permissions.includes("visitors:read");
  return true;
}
export function protectRecord(
  user: AccessUser,
  catalog: FieldClassification[],
  entity: string,
  record: object,
) {
  const output: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(record)) {
    const entry = catalog.find(
      (item) => item.entity === entity && item.field === field,
    );
    // Unknown fields fail closed; relation objects must be handled separately.
    if (!entry || !fieldVisible(user, entry.classification)) continue;
    const contact = entity === "Tenant" && ["email", "phone"].includes(field);
    output[field] =
      contact && user.role.code === "viewer" && value ? "Masked" : value;
  }
  return output;
}
export async function recordRead(
  tx: Prisma.TransactionClient,
  actor: Actor,
  entity: string,
  ids: string[],
  categories: string[],
) {
  if (!ids.length || !categories.length) return;
  await tx.auditLog.create({
    data: {
      actorId: actor.userId,
      ip: actor.ip,
      action: "CLASSIFIED_READ",
      entity,
      after: { recordIds: ids, categories },
    },
  });
}
