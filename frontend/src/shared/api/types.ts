export interface Profile {
  id: string;
  name: string;
  role: string;
  permissions: string[];
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
export interface Run {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  extracted: number;
  loaded: number;
  quarantined: number;
  deduplicated: number;
  error: string | null;
}
export interface Stage {
  id: string;
  source: string;
  stage: string;
  rowCount: number;
  message: string | null;
}
export interface Rule {
  id: string;
  code: string;
  title: string;
  dimension: string;
  severity: string;
  enabled: boolean;
}
export interface Snapshot {
  id: string;
  startedAt: string;
  status: string;
  checked: number;
  failed: number;
  score: number | null;
  change: number | null;
  rules: {
    id: string;
    definition: { title: string; code: string; dimension: string };
    checked: number;
    passed: number;
    failed: number;
    score: number | null;
  }[];
}
export interface Issue {
  id: string;
  runId: string;
  status: string;
  severity: string;
  message: string;
  note: string | null;
  updatedAt: string;
  rule: { code: string; title: string; dimension: string };
  staging: {
    source: string;
    sourceId: string;
    status: string;
    payload?: Record<string, string | null>;
  } | null;
}
export interface Tenant {
  id: string;
  externalId: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  units: { id: string; code: string }[];
}
export interface Unit {
  id: string;
  code: string;
}
export type ScalarRecord = Record<string, string | number | null>;
export interface Lineage {
  id: string;
  entity: string;
  entityId: string;
  field: string;
  source: string;
  sourceId: string;
  method: string;
  run: { id: string; startedAt: string; status: string };
}
export interface TenantDetail {
  tenant: ScalarRecord;
  leases: (Record<string, unknown> & { unit: Unit })[];
  dues: ScalarRecord[];
  requests: ScalarRecord[];
  visitors: ScalarRecord[];
  access: { finance: boolean; visitors: boolean };
  lineage: Lineage[];
}
export interface Catalog {
  id: string;
  entity: string;
  field: string;
  source: string;
  classification: string;
  owner: { name: string };
  policy: { id: string; name: string; description: string };
}
export interface Policy {
  id: string;
  name: string;
  description: string;
}
export interface Role {
  id: string;
  code: string;
  name: string;
  permissions: string[];
}
export interface User {
  id: string;
  name: string;
  email: string;
  active: boolean;
  roleId: string;
  role: { name: string; code: string };
}
export interface Audit {
  id: string;
  createdAt: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  ip: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}
