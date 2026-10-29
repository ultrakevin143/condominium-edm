"use client";
import { Button } from "./ui/button";
import { Table } from "./ui/table";
export function DataState({
  loading,
  error,
  onRetry,
  children,
}: {
  loading: boolean;
  error: string;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  if (loading)
    return (
      <div
        aria-busy="true"
        aria-label="Loading table"
        className="skeleton-list"
      >
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton-row" />
        ))}
      </div>
    );
  if (error)
    return (
      <div role="alert" className="notice">
        <p>{error}</p>
        <Button variant="outline" onClick={onRetry}>
          Retry loading
        </Button>
      </div>
    );
  return <>{children}</>;
}
export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="empty">{children}</p>;
}
export function Status({ value }: { value: string }) {
  return (
    <span
      className={`status ${["FAILED", "QUARANTINED", "error"].includes(value) ? "status-attention" : ""}`}
    >
      {value.replaceAll("_", " ").toLowerCase()}
    </span>
  );
}
export function Pagination({
  page,
  total,
  limit = 25,
  onPage,
}: {
  page: number;
  total: number;
  limit?: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="pagination">
      <span>
        {total} records · Page {page} of {Math.max(1, Math.ceil(total / limit))}
      </span>
      <Button
        variant="outline"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Previous
      </Button>
      <Button
        variant="outline"
        disabled={page * limit >= total}
        onClick={() => onPage(page + 1)}
      >
        Next
      </Button>
    </div>
  );
}
export function RecordTable({
  records,
  columns,
}: {
  records: Record<string, unknown>[];
  columns: string[];
}) {
  return records.length ? (
    <Table>
      <thead>
        <tr>
          {columns.map((k) => (
            <th key={k}>{label(k)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {records.map((r, i) => (
          <tr key={String(r.id ?? i)}>
            {columns.map((k) => (
              <td key={k}>
                {r[k] == null
                  ? "—"
                  : typeof r[k] === "object"
                    ? "See details"
                    : String(r[k])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </Table>
  ) : (
    <Empty>No permitted records in this section for the current tenant.</Empty>
  );
}
export function label(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/^./, (c) => c.toUpperCase());
}
