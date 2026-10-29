"use client";
import { useState, type FormEvent } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { useResource } from "../../shared/use-resource";
import { send } from "../../shared/api/client";
import type {
  Profile,
  Catalog,
  Policy,
  Role,
  User,
  Page,
  Audit,
} from "../../shared/api/types";
import { Button } from "../../shared/ui/button";
import { Input } from "../../shared/ui/input";
import { Table } from "../../shared/ui/table";
import { DataState, Empty, Pagination, label } from "../../shared/data-view";
import { date } from "../../shared/utils";
import { AdminRecovery } from "../account/admin-recovery";
export function GovernanceScreen({ profile }: { profile: Profile }) {
  const allowed = profile.permissions.includes("governance:read"),
    admin = profile.permissions.includes("governance:manage"),
    audit = profile.permissions.includes("audit:read");
  return (
    <>
      <header className="page-header">
        <div>
          <h1>Governance</h1>
          <p>Understand ownership, access policies and recorded actions.</p>
        </div>
      </header>
      <Tabs.Root defaultValue="catalog">
        <Tabs.List className="subtabs" aria-label="Governance sections">
          <Tabs.Trigger value="catalog">Data catalog</Tabs.Trigger>
          {allowed && (
            <Tabs.Trigger value="policies">Policies & roles</Tabs.Trigger>
          )}
          {admin && <Tabs.Trigger value="users">Account roles</Tabs.Trigger>}
          {audit && <Tabs.Trigger value="audit">Audit history</Tabs.Trigger>}
        </Tabs.List>
        <Tabs.Content value="catalog">
          <CatalogScreen />
        </Tabs.Content>
        {allowed && (
          <Tabs.Content value="policies">
            <PoliciesScreen admin={admin} />
          </Tabs.Content>
        )}
        {admin && (
          <Tabs.Content value="users">
            <UsersScreen profile={profile} />
          </Tabs.Content>
        )}
        {audit && (
          <Tabs.Content value="audit">
            <AuditScreen />
          </Tabs.Content>
        )}
      </Tabs.Root>
    </>
  );
}
function CatalogScreen() {
  const resource = useResource<Catalog[]>("/governance/catalog");
  return (
    <DataState {...resource} onRetry={resource.reload}>
      {resource.data?.length ? (
        <Table>
          <caption>Field ownership and classification</caption>
          <thead>
            <tr>
              <th>Entity</th>
              <th>Field</th>
              <th>Classification</th>
              <th>Owner</th>
              <th>Source</th>
              <th>Policy</th>
            </tr>
          </thead>
          <tbody>
            {resource.data.map((c) => (
              <tr key={c.id}>
                <th>{c.entity}</th>
                <td>{label(c.field)}</td>
                <td>{c.classification.toLowerCase()}</td>
                <td className="wrap-cell">{c.owner.name}</td>
                <td>{c.source}</td>
                <td>{c.policy.name}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <Empty>
          No catalog entries yet. Provision the local demonstration metadata.
        </Empty>
      )}
    </DataState>
  );
}
function PoliciesScreen({ admin }: { admin: boolean }) {
  const policies = useResource<Policy[]>("/governance/policies"),
    roles = useResource<Role[]>("/governance/roles"),
    [selected, setSelected] = useState<Policy | null>(null),
    [description, setDescription] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      await send(
        `/governance/policies/${selected.id}`,
        { description, expectedDescription: selected.description, reason },
        "PATCH",
      );
      setMessage("Policy updated and audit entry recorded.");
      setSelected(null);
      policies.reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Policy update failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h2>Policy text</h2>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <DataState {...policies} onRetry={policies.reload}>
        {policies.data?.length === 0 && (
          <Empty>No policies have been configured.</Empty>
        )}
        {policies.data?.map((p) => (
          <article className="policy" key={p.id}>
            <h3>{p.name}</h3>
            <p>{p.description}</p>
            {admin && (
              <Button
                variant="outline"
                onClick={() => {
                  setSelected(p);
                  setDescription(p.description);
                  setReason("");
                }}
              >
                Edit policy text
              </Button>
            )}
          </article>
        ))}
      </DataState>
      {selected && (
        <form className="editor" onSubmit={submit}>
          <h3>Edit {selected.name}</h3>
          <label>
            Description
            <textarea
              value={description}
              disabled={busy}
              onChange={(e) => setDescription(e.target.value)}
              required
              minLength={20}
              maxLength={3000}
            />
          </label>
          <label>
            Reason
            <textarea
              value={reason}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={10}
              maxLength={1000}
            />
          </label>
          <div className="actions">
            <Button disabled={busy}>{busy ? "Saving…" : "Save policy"}</Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setSelected(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      <h2>Role permissions</h2>
      <DataState {...roles} onRetry={roles.reload}>
        {roles.data?.length === 0 && (
          <Empty>No roles have been configured.</Empty>
        )}
        <Table>
          <thead>
            <tr>
              <th>Role</th>
              <th>Granted permissions</th>
            </tr>
          </thead>
          <tbody>
            {roles.data?.map((r) => (
              <tr key={r.id}>
                <th>{r.name}</th>
                <td className="wrap-cell">{r.permissions.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </DataState>
      <p className="context">
        Policy text documents responsibilities. Server permissions enforce
        access; editing prose does not change those permissions.
      </p>
    </>
  );
}
function UsersScreen({ profile }: { profile: Profile }) {
  const [recoveryUser, setRecoveryUser] = useState<User | null>(null);
  const users = useResource<User[]>("/governance/users"),
    roles = useResource<Role[]>("/governance/roles"),
    [selected, setSelected] = useState<User | null>(null),
    [roleId, setRoleId] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      await send(
        `/governance/users/${selected.id}/role`,
        { roleId, expectedRoleId: selected.roleId, reason },
        "PATCH",
      );
      setMessage(
        "Role changed. The account’s sessions were revoked; sign in again to use the new role.",
      );
      setSelected(null);
      users.reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Role update failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h2>Account roles</h2>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <DataState {...users} onRetry={users.reload}>
        {users.data?.length === 0 && (
          <Empty>No accounts have been configured.</Empty>
        )}
        <Table>
          <thead>
            <tr>
              <th>Account</th>
              <th>Role</th>
              <th>Access</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {users.data?.map((u) => (
              <tr key={u.id}>
                <th>
                  {u.name}
                  <small>{u.email}</small>
                </th>
                <td>{u.role.name}</td>
                <td>{u.active ? "Active" : "Inactive"}</td>
                <td>
                  <Button
                    variant="ghost"
                    disabled={u.id === profile.id}
                    onClick={() => {
                      setRecoveryUser(null);
                      setSelected(u);
                      setRoleId(u.roleId);
                      setReason("");
                    }}
                  >
                    Change role
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={u.id === profile.id || !u.active}
                    onClick={() => {
                      setSelected(null);
                      setRecoveryUser(u);
                    }}
                  >
                    Manage recovery
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </DataState>
      {recoveryUser && (
        <AdminRecovery
          user={recoveryUser}
          onClose={() => setRecoveryUser(null)}
        />
      )}
      {selected && (
        <form className="editor" onSubmit={submit}>
          <h3>Change role for {selected.name}</h3>
          <label>
            Role
            <select
              aria-label="Role"
              disabled={busy}
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              required
            >
              {roles.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Reason
            <textarea
              value={reason}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={10}
              maxLength={1000}
            />
          </label>
          <div className="actions">
            <Button disabled={busy || roleId === selected.roleId}>
              {busy ? "Saving…" : "Save role"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setSelected(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      <p className="context">
        Another administrator must change your own role. The last active
        administrator is protected.
      </p>
    </>
  );
}
function AuditScreen() {
  const [page, setPage] = useState(1),
    [filter, setFilter] = useState(""),
    [selected, setSelected] = useState<Audit | null>(null),
    resource = useResource<Page<Audit>>(
      `/governance/audit?page=${page}${filter}`,
    );
  function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget),
      query = new URLSearchParams();
    for (const k of ["action", "entity"]) {
      const v = String(data.get(k) ?? "");
      if (v) query.set(k, v);
    }
    setFilter(query.size ? `&${query}` : "");
    setPage(1);
  }
  return (
    <>
      <form className="filter-bar" onSubmit={search}>
        <label>
          Action
          <Input
            name="action"
            placeholder="e.g. PIPELINE_FINISHED"
            maxLength={80}
          />
        </label>
        <label>
          Entity
          <Input name="entity" placeholder="e.g. TenantDetail" maxLength={80} />
        </label>
        <Button type="submit" variant="outline">
          Filter history
        </Button>
      </form>
      <DataState {...resource} onRetry={resource.reload}>
        {resource.data?.items.length ? (
          <>
            <Table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Actor</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {resource.data.items.map((a) => (
                  <tr key={a.id}>
                    <td>{date(a.createdAt)}</td>
                    <th>{label(a.action.toLowerCase())}</th>
                    <td>{a.entity}</td>
                    <td className="id-cell">{a.actorId ?? "System"}</td>
                    <td>
                      <Button variant="ghost" onClick={() => setSelected(a)}>
                        Inspect event
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination
              page={page}
              total={resource.data.total}
              onPage={setPage}
            />
          </>
        ) : (
          <Empty>
            No audit events match these filters. Important system actions are
            recorded here.
          </Empty>
        )}
      </DataState>
      {selected && (
        <section className="detail-section">
          <div className="section-title">
            <h3>Audit event</h3>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              Close event
            </Button>
          </div>
          <p>
            {selected.action} · {date(selected.createdAt)} · IP{" "}
            {selected.ip ?? "Not recorded"}
          </p>
          <p className="context">
            Actor: {selected.actorId ?? "System"} · Entity ID:{" "}
            {selected.entityId ?? "Not applicable"}
          </p>
          {["before", "after"].map((side) => (
            <div key={side}>
              <h3>{label(side)}</h3>
              <dl className="record-fields">
                {Object.entries(selected[side as "before" | "after"] ?? {}).map(
                  ([key, value]) => (
                    <div key={key}>
                      <dt>{label(key)}</dt>
                      <dd>{readable(value)}</dd>
                    </div>
                  ),
                )}
              </dl>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
function readable(value: unknown): string {
  if (value == null) return "Not recorded";
  if (Array.isArray(value)) return value.map(readable).join(", ");
  if (typeof value === "object")
    return Object.entries(value)
      .map(([k, v]) => `${label(k)}: ${readable(v)}`)
      .join("; ");
  return String(value);
}
