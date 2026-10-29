import { createHash } from "node:crypto";
import { z } from "zod";

export const sources = [
  "tenancy",
  "billing",
  "maintenance",
  "visitor_log",
] as const;
export type Source = (typeof sources)[number];
export type Payload = Record<string, string | null>;
export interface Extracted {
  source: Source;
  sourceId: string;
  payload: Payload;
}
export function normalizeUnit(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value
    .normalize("NFKC")
    .trim()
    .replace(/^unit\s*/i, "")
    .match(/^(\d{1,8})\s*-?\s*([a-z]{1,4})$/i);
  return match ? `${match[1]}-${match[2]!.toUpperCase()}` : null;
}
export function nameKey(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[.]/g, "")
    .split(/\s+/)
    .filter(
      (token, i, all) => !(i > 0 && i < all.length - 1 && token.length === 1),
    )
    .join(" ");
}

// A missing middle initial may match, but two different initials cannot.
// Fallback matching also requires a unique candidate in the same unit.
export function namesMatch(left: unknown, right: unknown): boolean {
  const tokens = (value: unknown) =>
    typeof value === "string"
      ? value
          .normalize("NFKC")
          .trim()
          .toLocaleLowerCase("en")
          .replace(/[.]/g, "")
          .split(/\s+/)
          .filter(Boolean)
      : [];
  const a = tokens(left),
    b = tokens(right);
  if (a.length < 2 || b.length < 2 || a[0] !== b[0] || a.at(-1) !== b.at(-1))
    return false;
  const middleA = a.slice(1, -1),
    middleB = b.slice(1, -1);
  if (!middleA.length || !middleB.length) return true;
  return (
    middleA.length === middleB.length &&
    middleA.every((token, i) => {
      const other = middleB[i]!;
      return (
        token === other ||
        (token.length === 1 && other.startsWith(token)) ||
        (other.length === 1 && token.startsWith(other))
      );
    })
  );
}

function fallbackId(name: unknown, unit: string | null): string {
  const normalized =
    typeof name === "string"
      ? name
          .normalize("NFKC")
          .trim()
          .toLocaleLowerCase("en")
          .replace(/[.]/g, "")
          .replace(/\s+/g, " ")
      : "";
  return normalized && unit ? `MATCH:${normalized}:${unit}` : "";
}
export function displayName(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en")
    .replace(/(^|[\s'-])\p{L}/gu, (c) => c.toLocaleUpperCase("en"));
}
// Date-only input is ISO YYYY-MM-DD or explicitly DD/MM/YYYY. No locale guessing.
export function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  let y: number, m: number, d: number;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s))
    [y, m, d] = s.split("-").map(Number) as [number, number, number];
  else if (/^\d{2}\/\d{2}\/\d{4}$/.test(s))
    [d, m, y] = s.split("/").map(Number) as [number, number, number];
  else {
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
        s,
      ) ||
      !parseDate(s.slice(0, 10))
    )
      return null;
    const date = new Date(s);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
    ? date
    : null;
}
export const validEmail = (value: unknown) =>
  typeof value === "string" && z.email().safeParse(value.trim()).success;
export function money(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{1,10}(?:\.\d{1,2})?$/.test(value))
    return null;
  return value;
}
export function digest(value: unknown): string {
  const ordered = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(ordered)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, ordered(x)]),
          )
        : v;
  return createHash("sha256")
    .update(JSON.stringify(ordered(value)))
    .digest("hex");
}
export function stableId(value: string) {
  const h = digest(value);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export const ageDays = (date: Date, now: Date) =>
  Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86400000));
export function monthsOverdue(date: Date, now: Date) {
  return Math.max(
    0,
    (now.getUTCFullYear() - date.getUTCFullYear()) * 12 +
      now.getUTCMonth() -
      date.getUTCMonth() -
      (now.getUTCDate() < date.getUTCDate() ? 1 : 0),
  );
}
export interface Candidate extends Extracted {
  unit: string | null;
  identity: string | null;
  canonicalName: string | null;
  duplicate: boolean;
  leaseConflict: boolean;
  nameMatches: boolean;
  date: Date | null;
  endDate: Date | null;
  status: string | null;
  intrinsicErrors: string[];
}
export function prepare(
  rows: Extracted[],
  excluded = new Set<string>(),
): Candidate[] {
  const isExcluded = (r: Extracted) =>
    excluded.has(`${r.source}:${r.sourceId}`);
  const candidates = new Map<Extracted, Candidate>();
  const byId = new Map<string, Candidate>();
  const identityUnits = new Map<string, Set<string>>();
  const eligibleTenancies: Candidate[] = [];
  const seen = new Map<string, string>();
  const activeUnits = new Map<string, string>();
  // Validate tenancy records first. A quarantined or invalid tenancy must not
  // act as proof of identity, occupy a unit, or validate another source row.
  for (const row of rows.filter((r) => r.source === "tenancy")) {
    const p = row.payload;
    const unit = normalizeUnit(p.unitCode);
    const identity =
      p.tenantId?.trim() || fallbackId(p.tenantName, unit) || null;
    const date = parseDate(p.leaseStart);
    const endDate = p.leaseEnd ? parseDate(p.leaseEnd) : null;
    const rawStatus = p.status?.trim().toUpperCase();
    const status =
      (
        {
          ACTIVE: "ACTIVE",
          INACTIVE: "CLOSED",
          CLOSED: "CLOSED",
          ENDED: "CLOSED",
        } as Record<string, string>
      )[rawStatus ?? ""] ?? null;
    const errors: string[] = [];
    if (!unit) errors.push("Unit code cannot be normalized.");
    if (!identity)
      errors.push("Tenant identity cannot be matched unambiguously.");
    if (isExcluded(row)) errors.push("Quarantined by a data steward.");
    if (
      !date ||
      (p.leaseEnd && !endDate) ||
      (endDate && date && endDate < date)
    )
      errors.push("A required date is missing, invalid or reversed.");
    if (!status) errors.push("Status code is unsupported.");
    if (!nameKey(p.tenantName)) errors.push("Tenant name is required.");
    const existing = identity ? byId.get(identity) : undefined;
    const nameMatches =
      !existing || namesMatch(existing.payload.tenantName, p.tenantName);
    if (!nameMatches)
      errors.push(
        "Tenant name conflicts with another tenancy record for this identity.",
      );
    const key = `${identity}|${unit}|${date?.toISOString()}|${status}`;
    const signature = `${endDate?.toISOString() ?? ""}|${nameKey(p.tenantName)}|${p.email?.trim().toLowerCase() ?? ""}|${p.phone?.trim() ?? ""}`;
    const previous = seen.get(key);
    const duplicate = errors.length === 0 && previous === signature;
    const owner =
      unit && status === "ACTIVE" ? activeUnits.get(unit) : undefined;
    const leaseConflict =
      errors.length === 0 &&
      Boolean((previous && previous !== signature) || (owner && owner !== key));
    if (leaseConflict)
      errors.push(
        "Another active lease or a conflicting lease occupies this unit.",
      );
    const candidate: Candidate = {
      ...row,
      unit,
      identity,
      canonicalName: p.tenantName ? displayName(p.tenantName) : null,
      duplicate,
      leaseConflict,
      nameMatches,
      date,
      endDate,
      status,
      intrinsicErrors: errors,
    };
    candidates.set(row, candidate);
    if (errors.length || !identity || !unit) continue;
    if (!previous) seen.set(key, signature);
    if (status === "ACTIVE" && !owner) activeUnits.set(unit, key);
    if (!byId.has(identity)) byId.set(identity, candidate);
    const units = identityUnits.get(identity) ?? new Set<string>();
    units.add(unit);
    identityUnits.set(identity, units);
    eligibleTenancies.push(candidate);
  }
  const validUnits = new Set(eligibleTenancies.map((row) => row.unit));
  return rows.map((row) => {
    if (row.source === "tenancy") return candidates.get(row)!;
    const p = row.payload,
      unit = normalizeUnit(p.unitCode);
    const ids = new Set(
      eligibleTenancies
        .filter(
          (t) =>
            normalizeUnit(t.payload.unitCode) === unit &&
            namesMatch(t.payload.tenantName, p.tenantName),
        )
        .map(
          (t) =>
            t.payload.tenantId?.trim() ||
            fallbackId(t.payload.tenantName, unit),
        )
        .filter(Boolean),
    );
    const identity =
      p.tenantId?.trim() || (ids?.size === 1 ? [...ids][0]! : null);
    const canonical = identity ? byId.get(identity) : null;
    const dateField = {
      tenancy: "leaseStart",
      billing: "dueDate",
      maintenance: "openedAt",
      visitor_log: "enteredAt",
    }[row.source];
    const date = parseDate(p[dateField]);
    const endDate = p.leaseEnd ? parseDate(p.leaseEnd) : null;
    const rawStatus = p.status?.trim().toUpperCase();
    const status =
      row.source === "maintenance"
        ? ((
            {
              OPEN: "OPEN",
              PENDING: "OPEN",
              IN_PROGRESS: "IN_PROGRESS",
              CLOSED: "CLOSED",
              COMPLETED: "CLOSED",
            } as Record<string, string>
          )[rawStatus ?? ""] ?? null)
        : null;
    const errors: string[] = [];
    if (!unit) errors.push("Unit code cannot be normalized.");
    if (!identity || !canonical)
      errors.push("Tenant identity cannot be matched unambiguously.");
    if (isExcluded(row)) errors.push("Quarantined by a data steward.");
    if (!unit || !validUnits.has(unit))
      errors.push("Referenced unit does not exist in tenancy.");
    if (identity && unit && !identityUnits.get(identity)?.has(unit))
      errors.push(
        "Referenced unit does not belong to this tenant in the tenancy source.",
      );
    if (
      !date ||
      (p.leaseEnd && !endDate) ||
      (endDate && date && endDate < date)
    )
      errors.push("A required date is missing, invalid or reversed.");
    if (row.source === "maintenance" && !status)
      errors.push("Status code is unsupported.");
    if (!nameKey(p.tenantName)) errors.push("Tenant name is required.");
    if (
      row.source === "billing" &&
      (!money(p.amountDue) ||
        !money(p.amountPaid) ||
        !/^\d{4}-(0[1-9]|1[0-2])$/.test(p.period ?? ""))
    )
      errors.push("Billing amounts or period are invalid.");
    if (row.source === "maintenance" && !p.description?.trim())
      errors.push("Maintenance description is required.");
    if (row.source === "visitor_log" && !p.visitorName?.trim())
      errors.push("Visitor name is required.");
    return {
      ...row,
      unit,
      identity: canonical ? identity : null,
      canonicalName: canonical?.payload.tenantName
        ? displayName(canonical.payload.tenantName)
        : null,
      duplicate: false,
      leaseConflict: false,
      nameMatches: Boolean(
        canonical && namesMatch(canonical.payload.tenantName, p.tenantName),
      ),
      date,
      endDate,
      status,
      intrinsicErrors: errors,
    };
  });
}
