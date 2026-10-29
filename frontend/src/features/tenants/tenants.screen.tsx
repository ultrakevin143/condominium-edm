"use client";
import { useState, type FormEvent } from "react";
import { useResource } from "../../shared/use-resource";
import type { Page, Tenant, TenantDetail, Unit } from "../../shared/api/types";
import { Button } from "../../shared/ui/button";
import { Input } from "../../shared/ui/input";
import { Table } from "../../shared/ui/table";
import {
  DataState,
  Empty,
  Pagination,
  RecordTable,
} from "../../shared/data-view";
import { date } from "../../shared/utils";
export function TenantsScreen() {
  const [page, setPage] = useState(1),
    [query, setQuery] = useState(""),
    [tab, setTab] = useState("tenants"),
    [selected, setSelected] = useState<string | null>(null);
  const list = useResource<Page<Tenant & Unit>>(
      `/warehouse/${tab}?page=${page}&q=${encodeURIComponent(query)}`,
    ),
    detail = useResource<TenantDetail>(
      selected ? `/warehouse/tenants/${selected}` : null,
    );
  function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setQuery(String(new FormData(e.currentTarget).get("q") ?? ""));
    setPage(1);
  }
  return (
    <>
      <header className="page-header">
        <div>
          <h1>Tenants & units</h1>
          <p>Unified records with access applied for your signed-in role.</p>
        </div>
        <Button variant="outline" onClick={list.reload}>
          Refresh records
        </Button>
      </header>
      <div className="filter-bar">
        <div className="actions">
          <Button
            variant={tab === "tenants" ? "default" : "outline"}
            onClick={() => {
              setTab("tenants");
              setPage(1);
              setSelected(null);
            }}
          >
            Tenants
          </Button>
          <Button
            variant={tab === "units" ? "default" : "outline"}
            onClick={() => {
              setTab("units");
              setPage(1);
              setSelected(null);
            }}
          >
            Units
          </Button>
        </div>
        <form className="search-form" onSubmit={search}>
          <label htmlFor="tenant-search">Search {tab}</label>
          <Input
            id="tenant-search"
            name="q"
            placeholder={
              tab === "tenants" ? "Name, tenant ID or unit" : "Unit code"
            }
            maxLength={100}
          />
          <Button variant="outline" type="submit">
            Search
          </Button>
        </form>
      </div>
      <DataState {...list} onRetry={list.reload}>
        {list.data?.items.length ? (
          <>
            <Table>
              <thead>
                <tr>
                  {tab === "tenants" ? (
                    <>
                      <th>Name</th>
                      <th>Tenant ID</th>
                      <th>Units</th>
                      <th>Email</th>
                      <th>Contact</th>
                      <th>Details</th>
                    </>
                  ) : (
                    <th>Unit code</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((r) => (
                  <tr key={r.id}>
                    {tab === "tenants" ? (
                      <>
                        <th>{r.name ?? "Restricted"}</th>
                        <td>{r.externalId}</td>
                        <td>
                          {r.units.map((u) => u.code).join(", ") ||
                            "No accepted lease"}
                        </td>
                        <td>{r.email ?? "Not available"}</td>
                        <td>{r.phone ?? "Not available"}</td>
                        <td>
                          <Button
                            variant="ghost"
                            onClick={() => setSelected(r.id)}
                          >
                            Open tenant
                          </Button>
                        </td>
                      </>
                    ) : (
                      <td>{r.code}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} total={list.data.total} onPage={setPage} />
          </>
        ) : (
          <Empty>
            No {tab} match this search. Run the pipeline to load accepted source
            records.
          </Empty>
        )}
      </DataState>
      {selected && (
        <section className="detail-section">
          <div className="section-title">
            <h2>Tenant details</h2>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              Close details
            </Button>
          </div>
          <DataState {...detail} onRetry={detail.reload}>
            {detail.data && (
              <>
                <h3>
                  {String(detail.data.tenant.name ?? "Restricted tenant")}
                </h3>
                <p className="context">
                  {String(detail.data.tenant.externalId ?? "")} · Values reflect
                  the last accepted source evidence. Quarantine or missing input
                  can leave an earlier value in place; inspect the lineage dates
                  below.
                </p>
                <h3>Accepted leases</h3>
                <RecordTable
                  records={detail.data.leases.map((l) => ({
                    ...l,
                    unitCode: l.unit?.code,
                  }))}
                  columns={["unitCode", "startDate", "endDate", "status"]}
                />
                <h3>Dues ledger</h3>
                {detail.data.access.finance ? (
                  <RecordTable
                    records={detail.data.dues}
                    columns={[
                      "period",
                      "dueDate",
                      "amountDue",
                      "amountPaid",
                      "balance",
                      "monthsOverdue",
                    ]}
                  />
                ) : (
                  <p className="access-note">
                    Financial amounts are available to Property manager and
                    Finance roles.
                  </p>
                )}
                <h3>Maintenance</h3>
                <RecordTable
                  records={detail.data.requests}
                  columns={["description", "openedAt", "status", "daysOpen"]}
                />
                <h3>Visitor entries</h3>
                {detail.data.access.visitors ? (
                  <RecordTable
                    records={detail.data.visitors}
                    columns={["visitorName", "enteredAt"]}
                  />
                ) : (
                  <p className="access-note">
                    Visitor entries are restricted to Property manager and Front
                    desk/Security.
                  </p>
                )}
                <h3>Field lineage</h3>
                {detail.data.lineage.length ? (
                  <Table>
                    <thead>
                      <tr>
                        <th>Entity / field</th>
                        <th>Source record</th>
                        <th>Processing</th>
                        <th>Observed in run</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.data.lineage.map((l) => (
                        <tr key={l.id}>
                          <th>
                            {l.entity}.{l.field}
                          </th>
                          <td>
                            {l.source}
                            <small>{l.sourceId}</small>
                          </td>
                          <td className="wrap-cell">{l.method}</td>
                          <td>{date(l.run.startedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                ) : (
                  <Empty>No permitted field lineage for this record.</Empty>
                )}
              </>
            )}
          </DataState>
        </section>
      )}
    </>
  );
}
