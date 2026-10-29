import { z } from "zod";
const text = z.string().trim().max(300).nullable();
export const correctionSchemas = {
  tenancy: z
    .object({
      tenantId: text,
      tenantName: text,
      unitCode: text,
      email: text,
      phone: text,
      leaseStart: text,
      leaseEnd: text,
      status: text,
    })
    .partial()
    .strict(),
  billing: z
    .object({
      tenantId: text,
      tenantName: text,
      unitCode: text,
      period: text,
      dueDate: text,
      amountDue: text,
      amountPaid: text,
    })
    .partial()
    .strict(),
  maintenance: z
    .object({
      tenantId: text,
      tenantName: text,
      unitCode: text,
      description: text,
      openedAt: text,
      status: text,
    })
    .partial()
    .strict(),
  visitor_log: z
    .object({
      tenantId: text,
      tenantName: text,
      unitCode: text,
      visitorName: text,
      enteredAt: text,
    })
    .partial()
    .strict(),
};
export const issueActionSchema = z
  .object({
    action: z.enum(["fix", "accept", "quarantine"]),
    note: z.string().trim().min(10).max(1000),
    expectedUpdatedAt: z.iso.datetime(),
    correction: z.record(z.string(), z.string().max(300).nullable()).optional(),
  })
  .strict();
export const pageSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
export const issuesQuerySchema = pageSchema.extend({
  rule: z.string().min(1).max(80).optional(),
  severity: z.enum(["warning", "error"]).optional(),
  status: z.enum(["OPEN", "RESOLVED", "QUARANTINED", "ACCEPTED"]).optional(),
  runId: z.uuid().optional(),
});
