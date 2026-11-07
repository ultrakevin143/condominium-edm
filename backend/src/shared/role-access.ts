// Each role can receive fewer permissions in the database, but not more than
// the pages and data assigned here.
const allowedByRole: Record<string, readonly string[]> = {
  admin: [
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
  steward: [
    "pipeline:run",
    "quality:read",
    "quality:manage",
    "governance:read",
    "tenants:read",
  ],
  finance: ["finance:read", "tenants:read"],
  frontdesk: ["visitors:read", "tenants:read"],
  viewer: ["tenants:read"],
};

export function effectivePermissions(
  role: string,
  granted: string[],
): string[] {
  const allowed = allowedByRole[role] ?? [];
  return granted.filter((permission) => allowed.includes(permission));
}
