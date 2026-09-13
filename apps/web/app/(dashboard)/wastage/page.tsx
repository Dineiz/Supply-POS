"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DatePresetFilter, type DateRange } from "@/components/filters/date-preset-filter";
import { Pagination } from "@/components/filters/pagination";
import { authFetch, ApiError } from "@/lib/api";
import { buildListQuery, type ListResponse } from "@/lib/list-query";
import { formatMoney, formatQty, formatDate } from "@/lib/format";
import type { WastageListItem } from "@/lib/types";

const REASON_LABELS: Record<string, string> = {
  SPOILED: "Spoiled",
  EXPIRED: "Expired",
  DAMAGED: "Damaged",
  PEST: "Pest",
  THEFT: "Theft",
  POWER_OUTAGE: "Power outage",
  SPILLAGE: "Spillage",
  QUALITY_REJECT: "Quality reject",
  OTHER: "Other",
};

export default function WastagePage() {
  const [rows, setRows] = useState<WastageListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    setLoading(true);
    authFetch<ListResponse<WastageListItem>>(`/wastage?${buildListQuery({ range, page, pageSize })}`)
      .then((res) => {
        setRows(res.rows);
        setTotal(res.total);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load wastage records."))
      .finally(() => setLoading(false));
  }, [range, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [range]);

  const pageLoss = rows.reduce((sum, r) => sum + Number(r.costImpact), 0);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Wastage</h1>
          <p className="text-sm text-ink-muted">
            {total} records · {formatMoney(pageLoss)} loss on this page
          </p>
        </div>
        <Link href="/wastage/new">
          <Button>+ Log wastage</Button>
        </Link>
      </div>

      <DatePresetFilter value={range} onChange={setRange} />

      {error && <p className="mb-4 rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-border bg-paper">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3">Wastage #</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Cost</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Reported by</th>
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
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-ink-muted">
                    No wastage recorded yet.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface">
                  <td className="px-4 py-3">
                    <span className="font-medium text-ink">{r.wastageNumber}</span>
                    {r.approvedByName && (
                      <p className="text-xs text-ink-faint">Approved by {r.approvedByName}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{r.item.name}</td>
                  <td className="font-tabular px-4 py-3 text-right text-ink-muted">
                    {formatQty(r.qty, r.unitCode)}
                  </td>
                  <td className="font-tabular px-4 py-3 text-right text-ink">{formatMoney(r.costImpact)}</td>
                  <td className="px-4 py-3 text-ink-muted">{REASON_LABELS[r.reason] ?? r.reason}</td>
                  <td className="font-tabular px-4 py-3 text-ink-muted">{formatDate(r.createdAt)}</td>
                  <td className="px-4 py-3 text-ink-muted">{r.reportedByName ?? "—"}</td>
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
