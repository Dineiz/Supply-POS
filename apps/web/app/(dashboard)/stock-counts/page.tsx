"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DatePresetFilter, type DateRange } from "@/components/filters/date-preset-filter";
import { Pagination } from "@/components/filters/pagination";
import { authFetch, ApiError } from "@/lib/api";
import { buildListQuery, type ListResponse } from "@/lib/list-query";
import { formatMoney, formatDate } from "@/lib/format";
import type { StockCountSessionListItem } from "@/lib/types";

const TYPE_LABELS: Record<string, string> = { FULL: "Full", PARTIAL: "By category", SPOT: "Spot" };

const STATUS_STYLES: Record<string, string> = {
  IN_PROGRESS: "bg-warning-surface text-warning",
  COMPLETED: "bg-success-surface text-success",
  CANCELLED: "bg-surface text-ink-faint",
};

export default function StockCountsPage() {
  const [sessions, setSessions] = useState<StockCountSessionListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    setLoading(true);
    authFetch<ListResponse<StockCountSessionListItem>>(`/stock-counts?${buildListQuery({ range, page, pageSize })}`)
      .then((res) => {
        setSessions(res.rows);
        setTotal(res.total);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load stock counts."))
      .finally(() => setLoading(false));
  }, [range, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [range]);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Stock counts</h1>
          <p className="text-sm text-ink-muted">{total} counts on record</p>
        </div>
        <Link href="/stock-counts/new">
          <Button>+ Start count</Button>
        </Link>
      </div>

      <DatePresetFilter value={range} onChange={setRange} />

      {error && <p className="mb-4 rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-border bg-paper">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3">Count #</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Items</th>
                <th className="px-4 py-3 text-right">Difference</th>
                <th className="px-4 py-3">Started by</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-ink-muted">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && sessions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-ink-muted">
                    No stock counts yet.
                  </td>
                </tr>
              )}
              {sessions.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0 hover:bg-surface">
                  <td className="px-4 py-3">
                    <Link href={`/stock-counts/${s.id}`} className="font-medium text-ink hover:underline">
                      {s.countNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{TYPE_LABELS[s.type] ?? s.type}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[s.status] ?? ""}`}
                    >
                      {s.status === "IN_PROGRESS" ? "In progress" : s.status === "COMPLETED" ? "Completed" : "Cancelled"}
                    </span>
                  </td>
                  <td className="font-tabular px-4 py-3 text-right text-ink-muted">{s.lines.length}</td>
                  <td className="font-tabular px-4 py-3 text-right text-ink">
                    {s.status === "IN_PROGRESS" ? "—" : formatMoney(s.totalVarianceValue ?? "0")}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{s.startedByName ?? "—"}</td>
                  <td className="font-tabular px-4 py-3 text-ink-muted">{formatDate(s.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n);
          setPage(1);
        }}
      />
    </div>
  );
}
