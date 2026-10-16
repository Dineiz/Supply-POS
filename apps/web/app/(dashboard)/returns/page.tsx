"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClickableRow } from "@/components/ui/clickable-row";
import { StatStrip } from "@/components/ui/stat-strip";
import { DatePresetFilter, type DateRange } from "@/components/filters/date-preset-filter";
import { PeriodEmpty } from "@/components/filters/period-empty";
import { Pagination } from "@/components/filters/pagination";
import { authFetch, ApiError } from "@/lib/api";
import { buildListQuery, type ListResponse } from "@/lib/list-query";
import { formatDate, formatMoney, formatTime, summarizeItems } from "@/lib/format";
import { todayRange } from "@/lib/period";
import type { ReturnListItem, ReturnListSummary } from "@/lib/types";

export default function ReturnsPage() {
  const [returns, setReturns] = useState<ReturnListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<ReturnListSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange | null>(todayRange);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    setPage(1);
  }, [range]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    authFetch<ListResponse<ReturnListItem, ReturnListSummary>>(`/returns?${buildListQuery({ range, page, pageSize })}`)
      .then((res) => {
        if (cancelled) return;
        setReturns(res.rows);
        setTotal(res.total);
        setSummary(res.summary);
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Could not load returns."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [range, page, pageSize]);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Returns</h1>
        <p className="text-sm text-ink-muted">
          Goods customers brought back. The value is taken off what they owe — it is not paid out in cash. Click a return to see the items.
        </p>
      </div>

      <DatePresetFilter value={range} onChange={setRange} />

      {summary && (
        <StatStrip
          items={[
            { label: "Returns", value: String(summary.count) },
            { label: "Taken off what customers owe", value: formatMoney(summary.creditAmount) },
            {
              label: "Lost on damaged / expired",
              value: formatMoney(summary.costWrittenOff),
              tone: Number(summary.costWrittenOff) > 0 ? "warning" : "default",
              hint: "Cost of goods that could not go back on the shelf",
            },
          ]}
        />
      )}

      {error && <p className="mb-4 rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-border bg-paper">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3">Return</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Items returned</th>
                <th className="px-4 py-3 text-right">Taken off bill</th>
                <th className="px-4 py-3 text-right">Cost lost</th>
                <th className="px-4 py-3">From delivery</th>
                <th className="px-4 py-3">When</th>
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
                  <td colSpan={7}>
                    <PeriodEmpty noun="returns" range={range} onChange={setRange} />
                  </td>
                </tr>
              )}
              {!loading &&
                returns.map((r) => {
                  const writtenOff = Number(r.totalCostWrittenOff);
                  return (
                    <ClickableRow key={r.id} href={`/returns/${r.id}`}>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Link href={`/returns/${r.id}`} className="font-medium text-ink hover:text-accent">
                          {r.returnNumber}
                        </Link>
                        {r.returnedByName && <p className="text-xs text-ink-faint">Brought by {r.returnedByName}</p>}
                      </td>
                      <td className="px-4 py-3 text-ink">{r.customer.name}</td>
                      <td className="max-w-[240px] px-4 py-3 text-ink-muted">
                        <span className="block truncate" title={r.lines.map((l) => l.itemName).join(", ")}>
                          {summarizeItems(
                            r.lines.map((l) => ({ name: l.itemName, qty: l.qty, unitCode: l.unitCode })),
                            2
                          )}
                        </span>
                      </td>
                      <td className="font-tabular whitespace-nowrap px-4 py-3 text-right text-ink">{formatMoney(r.totalCreditAmount)}</td>
                      <td className={`font-tabular whitespace-nowrap px-4 py-3 text-right ${writtenOff > 0 ? "text-warning" : "text-ink-faint"}`}>
                        {writtenOff > 0 ? formatMoney(writtenOff) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {r.originalIssue ? (
                          <Link href={`/issues/${r.originalIssue.id}`} className="text-accent hover:text-accent-hover">
                            {r.originalIssue.issueNumber}
                          </Link>
                        ) : (
                          <span className="text-ink-faint">Not linked</span>
                        )}
                      </td>
                      <td className="font-tabular whitespace-nowrap px-4 py-3 text-ink-muted">
                        {formatDate(r.createdAt)}
                        <span className="ml-2 text-ink-faint">{formatTime(r.createdAt)}</span>
                      </td>
                    </ClickableRow>
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
