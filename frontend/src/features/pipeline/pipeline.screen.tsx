"use client";
import { useState } from "react";
import { Play, RefreshCw } from "lucide-react";
import { useResource } from "../../shared/use-resource";
import { send } from "../../shared/api/client";
import type { Page, Run, Stage } from "../../shared/api/types";
import { Button } from "../../shared/ui/button";
import { Table } from "../../shared/ui/table";
import { DataState, Empty, Pagination, Status } from "../../shared/data-view";
import { date } from "../../shared/utils";
export function PipelineScreen({ canRun }: { canRun: boolean }) {
  const [page, setPage] = useState(1),
    [selected, setSelected] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const runs = useResource<Page<Run>>(`/pipeline/runs?page=${page}`),
    detail = useResource<Run & { stages: Stage[] }>(
      selected ? `/pipeline/runs/${selected}` : null,
    );
  async function run() {
    setBusy(true);
    setMessage("");
    try {
      const result = await send<Run>("/pipeline/runs");
      setMessage(
        `Run finished: ${result.loaded} loaded, ${result.quarantined} quarantined, ${result.deduplicated} deduplicated.`,
      );
      setSelected(result.id);
      setPage(1);
      runs.reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Run failed.");
      runs.reload();
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="page-header">
        <div>
          <h1>Pipeline</h1>
          <p>Reconcile tenancy, billing, maintenance and visitor sources.</p>
        </div>
        <div className="actions">
          <Button
            variant="outline"
            onClick={runs.reload}
            aria-label="Refresh pipeline history"
          >
            <RefreshCw size={16} />
          </Button>
          {canRun && (
            <Button disabled={busy} onClick={run}>
              <Play size={16} />
              {busy ? "Running pipeline…" : "Run pipeline"}
            </Button>
          )}
        </div>
      </header>
      <div className="process-strip">
        <span>Four source systems</span>
        <span>Normalize & check</span>
        <span>Unified records + lineage</span>
      </div>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <DataState {...runs} onRetry={runs.reload}>
        {runs.data?.items.length ? (
          <>
            <Table>
              <caption>Pipeline run history</caption>
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Status</th>
                  <th>Extracted</th>
                  <th>Loaded</th>
                  <th>Quarantine</th>
                  <th>Duplicates</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {runs.data.items.map((r) => (
                  <tr key={r.id}>
                    <td>{date(r.startedAt)}</td>
                    <td>
                      <Status value={r.status} />
                    </td>
                    <td>{r.extracted}</td>
                    <td>{r.loaded}</td>
                    <td>{r.quarantined}</td>
                    <td>{r.deduplicated}</td>
                    <td>
                      <Button variant="ghost" onClick={() => setSelected(r.id)}>
                        Inspect run
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} total={runs.data.total} onPage={setPage} />
          </>
        ) : (
          <Empty>
            No pipeline runs yet. Run the pipeline to load tenant and billing
            data.
          </Empty>
        )}
      </DataState>
      {selected && (
        <section className="detail-section">
          <div className="section-title">
            <h2>Run inspection</h2>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              Close inspection
            </Button>
          </div>
          <DataState {...detail} onRetry={detail.reload}>
            {detail.data && (
              <>
                <p className="context">
                  {date(detail.data.startedAt)} · {detail.data.status}
                  {detail.data.error ? ` · ${detail.data.error}` : ""}
                </p>
                <Table>
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Stage</th>
                      <th>Rows</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.data.stages.map((s) => (
                      <tr key={s.id}>
                        <td>{s.source}</td>
                        <td>{s.stage}</td>
                        <td>{s.rowCount}</td>
                        <td className="wrap-cell">
                          {s.message ?? "Source snapshot extracted."}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </>
            )}
          </DataState>
        </section>
      )}
    </>
  );
}
