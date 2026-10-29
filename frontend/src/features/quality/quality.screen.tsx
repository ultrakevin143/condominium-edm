"use client";
import { useState } from "react";
import { useResource } from "../../shared/use-resource";
import type { Snapshot } from "../../shared/api/types";
import { Button } from "../../shared/ui/button";
import { Table } from "../../shared/ui/table";
import { DataState, Empty } from "../../shared/data-view";
import { date, number } from "../../shared/utils";
export function QualityScreen() {
  const history = useResource<Snapshot[]>("/quality/history"),
    [selected, setSelected] = useState<string | null>(null);
  const current =
    history.data?.find((r) => r.id === selected) ?? history.data?.[0];
  return (
    <>
      <header className="page-header">
        <div>
          <h1>Data quality</h1>
          <p>Observed checks and actual results from each pipeline run.</p>
        </div>
        <Button variant="outline" onClick={history.reload}>
          Refresh results
        </Button>
      </header>
      <DataState {...history} onRetry={history.reload}>
        {current ? (
          <>
            <div className="score-summary">
              <strong>
                {current.score == null ? "Not measured" : `${current.score}%`}
              </strong>
              <p>
                Overall score · {number(current.checked)} checked observations
                <br />
                {current.change == null
                  ? "No previous comparable run"
                  : `${current.change > 0 ? "+" : ""}${current.change} percentage points from previous run`}
              </p>
            </div>
            <p className="context">
              Inspecting {date(current.startedAt)}. Changed rule coverage can
              affect comparisons. Accepted issues do not improve historical
              scores.
            </p>
            <Table>
              <caption>Rule results for selected run</caption>
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Dimension</th>
                  <th>Checked</th>
                  <th>Passed</th>
                  <th>Failed</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {current.rules.map((r) => (
                  <tr key={r.id}>
                    <th scope="row" className="wrap-cell">
                      {r.definition.title}
                    </th>
                    <td>{r.definition.dimension}</td>
                    <td>{r.checked}</td>
                    <td>{r.passed}</td>
                    <td>{r.failed}</td>
                    <td>{r.score == null ? "Not measured" : `${r.score}%`}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <section className="detail-section">
              <h2>Quality history</h2>
              <Table>
                <thead>
                  <tr>
                    <th>Run</th>
                    <th>Score</th>
                    <th>Checked</th>
                    <th>Failed</th>
                    <th>Change</th>
                    <th>Review</th>
                  </tr>
                </thead>
                <tbody>
                  {history.data!.map((r) => (
                    <tr key={r.id}>
                      <td>{date(r.startedAt)}</td>
                      <td>
                        {r.score == null ? "Not measured" : `${r.score}%`}
                      </td>
                      <td>{r.checked}</td>
                      <td>{r.failed}</td>
                      <td>{r.change == null ? "—" : `${r.change} pp`}</td>
                      <td>
                        <Button
                          variant="ghost"
                          onClick={() => setSelected(r.id)}
                        >
                          Inspect results
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </section>
          </>
        ) : (
          <Empty>
            No quality results yet. Run the pipeline to evaluate the source
            records.
          </Empty>
        )}
      </DataState>
    </>
  );
}
