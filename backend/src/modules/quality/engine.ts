import type { QualityRule } from "@prisma/client";
import { ApiError } from "../../shared/errors.js";
import {
  ageDays,
  money,
  validEmail,
  type Candidate,
} from "../pipeline/transform.js";
type Check = (
  row: Candidate,
  all: Candidate[],
  days: number,
  now: Date,
) => boolean | null;
const checks: Record<string, Check> = {
  tenant_contact: (r) =>
    r.source === "tenancy"
      ? Boolean(r.payload.email?.trim() && r.payload.phone?.trim())
      : null,
  lease_start: (r) =>
    r.source === "tenancy" ? Boolean(r.payload.leaseStart?.trim()) : null,
  date_validity: (r) =>
    Boolean(
      r.date && (!r.payload.leaseEnd || (r.endDate && r.endDate >= r.date)),
    ),
  unit_format: (r) => Boolean(r.unit),
  email_format: (r) =>
    r.source === "tenancy" && r.payload.email
      ? validEmail(r.payload.email)
      : null,
  nonnegative_amount: (r) =>
    r.source === "billing"
      ? Boolean(money(r.payload.amountDue) && money(r.payload.amountPaid))
      : null,
  tenant_unique: (r) => (r.source === "tenancy" ? !r.duplicate : null),
  active_lease: (r) =>
    r.source === "tenancy" && r.status === "ACTIVE" ? !r.leaseConflict : null,
  unit_reference: (r, all) =>
    r.source !== "tenancy"
      ? all.some((t) => t.source === "tenancy" && t.unit && t.unit === r.unit)
      : null,
  name_consistency: (r) => (r.identity ? r.nameMatches : null),
  overdue_dues: (r, _, days, now) =>
    r.source === "billing" && r.date
      ? !(
          Number(r.payload.amountDue) > Number(r.payload.amountPaid) &&
          ageDays(r.date, now) > days
        )
      : null,
  open_request: (r, _, days, now) =>
    r.source === "maintenance" && r.date
      ? !(r.status !== "CLOSED" && ageDays(r.date, now) > days)
      : null,
  record_validity: (r) => r.intrinsicErrors.length === 0,
};
export function qualityScore(checked: number, failed: number): number | null {
  return checked === 0
    ? null
    : Math.round(((checked - failed) / checked) * 10000) / 100;
}
export function evaluate(rules: QualityRule[], rows: Candidate[], now: Date) {
  return rules.map((rule) => {
    const check = checks[rule.code];
    if (!check)
      throw new ApiError(
        422,
        "UNKNOWN_RULE",
        "An enabled quality rule is unsupported.",
      );
    const params = rule.parameters as { days?: unknown };
    const days = Number(params.days ?? 0);
    if (
      (rule.code === "overdue_dues" || rule.code === "open_request") &&
      (!Number.isInteger(days) || days < 0 || days > 3650)
    )
      throw new ApiError(
        422,
        "INVALID_RULE",
        "Quality rule day threshold is invalid.",
      );
    const observations = rows
      .map((row) => ({ row, passed: check(row, rows, days, now) }))
      .filter((o) => o.passed !== null);
    const failures = observations.filter((o) => !o.passed).map((o) => o.row);
    return {
      rule,
      checked: observations.length,
      passed: observations.length - failures.length,
      failed: failures.length,
      failures,
    };
  });
}
