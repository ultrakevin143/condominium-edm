"use client";
import { useState, type FormEvent } from "react";
import { useResource } from "../../shared/use-resource";
import { send } from "../../shared/api/client";
import type { Issue, Page, Rule } from "../../shared/api/types";
import { Button } from "../../shared/ui/button";
import { Input } from "../../shared/ui/input";
import { Table } from "../../shared/ui/table";
import {
  DataState,
  Empty,
  Pagination,
  Status,
  label,
} from "../../shared/data-view";
const sourceFields: Record<string, string[]> = {
  tenancy: [
    "tenantId",
    "tenantName",
    "unitCode",
    "email",
    "phone",
    "leaseStart",
    "leaseEnd",
    "status",
  ],
  billing: [
    "tenantId",
    "tenantName",
    "unitCode",
    "period",
    "dueDate",
    "amountDue",
    "amountPaid",
  ],
  maintenance: [
    "tenantId",
    "tenantName",
    "unitCode",
    "description",
    "openedAt",
    "status",
  ],
  visitor_log: [
    "tenantId",
    "tenantName",
    "unitCode",
    "visitorName",
    "enteredAt",
  ],
};
export function IssuesScreen() {
  const [page, setPage] = useState(1),
    [filters, setFilters] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const rules = useResource<Rule[]>("/quality/rules"),
    issues = useResource<Page<Issue>>(`/issues?page=${page}${filters}`),
    detail = useResource<Issue>(selected ? `/issues/${selected}` : null);
  const [action, setAction] = useState("fix"),
    [field, setField] = useState(""),
    [value, setValue] = useState(""),
    [note, setNote] = useState("");
  function filter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget),
      q = new URLSearchParams();
    for (const key of ["rule", "severity", "status"]) {
      const v = String(form.get(key) ?? "");
      if (v) q.set(key, v);
    }
    setFilters(q.size ? `&${q}` : "");
    setPage(1);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!detail.data) return;
    setBusy(true);
    setMessage("");
    try {
      await send(
        `/issues/${detail.data.id}`,
        {
          action,
          note,
          expectedUpdatedAt: detail.data.updatedAt,
          ...(action === "fix"
            ? { correction: { [field]: value || null } }
            : {}),
        },
        "PATCH",
      );
      setMessage(
        action === "fix"
          ? "Correction verified in a new pipeline run."
          : "Issue decision saved.",
      );
      setSelected(null);
      issues.reload();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "The issue could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }
  const payload = detail.data?.staging?.payload ?? {};
  const editable = (
    sourceFields[detail.data?.staging?.source ?? ""] ?? []
  ).filter((k) => k in payload);
  return (
    <>
      <header className="page-header">
        <div>
          <h1>Issue queue</h1>
          <p>
            Review source defects, document decisions and verify corrections.
          </p>
        </div>
        <Button variant="outline" onClick={issues.reload}>
          Refresh queue
        </Button>
      </header>
      <form className="filter-bar" onSubmit={filter}>
        <label>
          Rule
          <select name="rule" aria-label="Rule">
            <option value="">All rules</option>
            {rules.data?.map((r) => (
              <option key={r.code} value={r.code}>
                {r.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Severity
          <select name="severity" aria-label="Severity">
            <option value="">All severities</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </select>
        </label>
        <label>
          Status
          <select name="status" aria-label="Status">
            <option value="">All statuses</option>
            {["OPEN", "QUARANTINED", "RESOLVED", "ACCEPTED"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <Button variant="outline" type="submit">
          Apply filters
        </Button>
      </form>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <DataState {...issues} onRetry={issues.reload}>
        {issues.data?.items.length ? (
          <>
            <Table>
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Source</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {issues.data.items.map((i) => (
                  <tr key={i.id}>
                    <th className="wrap-cell">{i.rule.title}</th>
                    <td>
                      {i.staging?.source ?? "Unclassified"}
                      <small>{i.staging?.sourceId}</small>
                    </td>
                    <td>
                      <Status value={i.severity} />
                    </td>
                    <td>
                      <Status value={i.status} />
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setSelected(i.id);
                          setField("");
                          setValue("");
                          setNote("");
                          setMessage("");
                        }}
                      >
                        Review issue
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination
              page={page}
              total={issues.data.total}
              onPage={setPage}
            />
          </>
        ) : (
          <Empty>
            No issues match this filter in the latest completed run. Adjust
            filters or run the pipeline.
          </Empty>
        )}
      </DataState>
      {selected && (
        <section className="detail-section">
          <div className="section-title">
            <h2>Review source issue</h2>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              Close review
            </Button>
          </div>
          <DataState {...detail} onRetry={detail.reload}>
            {detail.data && (
              <>
                <p>{detail.data.message}</p>
                {detail.data.note && (
                  <p className="context">Prior note: {detail.data.note}</p>
                )}
                <dl className="record-fields">
                  {Object.entries(payload).map(([k, v]) => (
                    <div key={k}>
                      <dt>{label(k)}</dt>
                      <dd>{v ?? "Missing"}</dd>
                    </div>
                  ))}
                </dl>
                {["OPEN", "QUARANTINED"].includes(detail.data.status) ? (
                  <form className="editor" onSubmit={submit}>
                    <p className="context">
                      Corrections must pass the selected rule. Quarantine stops
                      future loads; previously accepted warehouse values remain.
                    </p>
                    <label>
                      Decision
                      <select
                        aria-label="Decision"
                        disabled={busy}
                        value={action}
                        onChange={(e) => setAction(e.target.value)}
                      >
                        <option value="fix">Fix source record</option>
                        <option value="accept">Accept with a reason</option>
                        <option value="quarantine">
                          Quarantine future loads
                        </option>
                      </select>
                    </label>
                    {action === "fix" && (
                      <>
                        <label>
                          Field to correct
                          <select
                            aria-label="Field to correct"
                            disabled={busy}
                            value={field}
                            required
                            onChange={(e) => {
                              setField(e.target.value);
                              setValue(payload[e.target.value] ?? "");
                            }}
                          >
                            <option value="">Choose a field</option>
                            {editable.map((k) => (
                              <option key={k} value={k}>
                                {label(k)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Corrected value
                          <Input
                            value={value}
                            disabled={busy}
                            onChange={(e) => setValue(e.target.value)}
                            maxLength={300}
                          />
                        </label>
                        <p className="context">
                          Blank clears a field. Slash dates use DD/MM/YYYY; ISO
                          dates use YYYY-MM-DD.
                        </p>
                      </>
                    )}
                    <label>
                      Reason
                      <textarea
                        disabled={busy}
                        required
                        minLength={10}
                        maxLength={1000}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                    </label>
                    <Button
                      disabled={busy || (action === "fix" && !field)}
                      type="submit"
                    >
                      {busy ? "Verifying decision…" : "Save decision"}
                    </Button>
                  </form>
                ) : (
                  <p className="notice">
                    This issue has a recorded decision. Run the pipeline to
                    inspect current data.
                  </p>
                )}
              </>
            )}
          </DataState>
        </section>
      )}
    </>
  );
}
