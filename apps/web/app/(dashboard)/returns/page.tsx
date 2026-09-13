"use client";

import { useEffect, useState } from "react";
import { DatePresetFilter, type DateRange } from "@/components/filters/date-preset-filter";
import { Pagination } from "@/components/filters/pagination";
import { authFetch, ApiError } from "@/lib/api";
import { buildListQuery, type ListResponse } from "@/lib/list-query";
import { formatMoney } from "@/lib/format";
import type { ReturnListItem } from "@/lib/types";

export default function ReturnsPage() {
  const [returns, setReturns] = useState<ReturnListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    setLoading(true);
    authFetch<ListResponse<ReturnListItem>>(`/returns?${buildListQuery({ range, page, pageSize })}`)
      .then((res) => {
        setReturns(res.rows);
        setTotal(res.total);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load returns."))
      .finally(() => setLoading(false));
  }, [range, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [range]);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Returns</h1>
        <p className="text-sm text-ink-muted">{total} returns on record</p>
      </div>

      <DatePresetFilter value={range} onChange={setRange} />

      {error && <p className="mb-4 rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-border bg-paper">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3">Return</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Items</th>
                <th className="px-4 py-3 text-right">Amount back</th>
                <th className="px-4 py-3 text-right">Cost lost</th>
                <th className="px-4 py-3">Recorded by</th>
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
              {!loading && returns.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-ink-muted">
                    No returns yet.
                  </td>
                </tr>
              )}
              {returns.map((r) => {
                const writtenOff = Number(r.totalCostWrittenOff);
                return (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface">
                    <td className="px-4 py-3 font-medium text-ink">{r.returnNumber}</td>
                    <td className="px-4 py-3 text-ink-muted">{r.customer.name}</td>
                    <td className="font-tabular px-4 py-3 text-ink-muted">
                      {new Date(r.createdAt).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="font-tabular px-4 py-3 text-right text-ink-muted">{r.lines.length}</td>
                    <td className="font-tabular px-4 py-3 text-right text-ink">{formatMoney(r.totalCreditAmount)}</td>
                    <td className={`font-tabular px-4 py-3 text-right ${writtenOff > 0 ? "text-warning" : "text-ink-faint"}`}>
                      {writtenOff > 0 ? formatMoney(writtenOff) : "—"}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{r.returnedByName ?? "—"}</td>
                  </tr>
                );
              })}
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
