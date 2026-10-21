"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { ClickableRow } from "@/components/ui/clickable-row";
import { DeliveryPaymentChip } from "@/components/ui/status-chip";
import { StatStrip } from "@/components/ui/stat-strip";
import { DatePresetFilter, type DateRange } from "@/components/filters/date-preset-filter";
import { PeriodEmpty } from "@/components/filters/period-empty";
import { Pagination } from "@/components/filters/pagination";
import { authFetch, ApiError } from "@/lib/api";
import { buildListQuery, type ListResponse } from "@/lib/list-query";
import { formatDate, formatMoney, formatTime, summarizeItems } from "@/lib/format";
import { todayRange } from "@/lib/period";
import type { IssueListSummary, IssueSummary } from "@/lib/types";

export default function IssuesPage() {
  const [issues, setIssues] = useState<IssueSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<IssueListSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<DateRange | null>(todayRange);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Search runs on the server so it covers every page, not just the one on screen.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [range, query]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    authFetch<ListResponse<IssueSummary, IssueListSummary>>(`/issues?${buildListQuery({ range, page, pageSize, q: query })}`)
      .then((res) => {
        if (cancelled) return;
        setIssues(res.rows);
        setTotal(res.total);
        setSummary(res.summary);
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Could not load deliveries."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [range, query, page, pageSize]);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Deliveries</h1>
        <p className="text-sm text-ink-muted">Everything sent out to customers. Click a delivery to see every item and whether it is paid.</p>
      </div>

      <DatePresetFilter value={range} onChange={setRange} />

      {summary && (
        <StatStrip
          items={[
            { label: "Deliveries", value: String(summary.count) },
            { label: "Total delivered", value: formatMoney(summary.totalAmount) },
            { label: "Paid so far", value: formatMoney(summary.paidAmount), tone: "success" },
            {
              label: "Still to collect",
              value: formatMoney(summary.dueAmount),
              tone: Number(summary.dueAmount) > 0 ? "danger" : "default",
              hint: Number(summary.returnedAmount) > 0 ? `After ${formatMoney(summary.returnedAmount)} returned` : undefined,
            },
          ]}
        />
      )}

      <div className="mb-4 w-full max-w-sm">
        <Input placeholder="Search delivery number or customer…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {error && <p className="mb-4 rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-border bg-paper">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3">Delivery</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Items sent</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3" />
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
              {!loading && issues.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    {query ? (
                      <p className="px-4 py-10 text-center text-sm text-ink-muted">No deliveries match “{query}” in this period.</p>
                    ) : (
                      <PeriodEmpty noun="deliveries" range={range} onChange={setRange} />
                    )}
                  </td>
                </tr>
              )}
              {!loading &&
                issues.map((issue) => (
                  <ClickableRow key={issue.id} href={`/issues/${issue.id}`}>
                    <td className="whitespace-nowrap px-4 py-3">
                      <Link href={`/issues/${issue.id}`} className="font-medium text-ink hover:text-accent">
                        {issue.issueNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink">{issue.customer.name}</td>
                    <td className="max-w-[220px] px-4 py-3 text-ink-muted">
                      <span className="block truncate" title={issue.lines.map((l) => l.itemName).join(", ")}>
                        {summarizeItems(
                          issue.lines.map((l) => ({ name: l.itemName, qty: l.qty, unitCode: l.unitCode })),
                          2
                        )}
                      </span>
                      {issue.lines.some((l) => Number(l.returnedQty) > 0) && (
                        <span className="mt-0.5 block text-xs text-warning">
                          {issue.lines.filter((l) => Number(l.returnedQty) > 0).length} of {issue.lines.length} items returned
                        </span>
                      )}
                    </td>
                    <td className="font-tabular whitespace-nowrap px-4 py-3 text-right text-ink">
                      {formatMoney(issue.totalAmount)}
                      {Number(issue.payment.returned) > 0 && (
                        <p className="mt-0.5 text-xs text-warning">− {formatMoney(issue.payment.returned)} returned</p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <DeliveryPaymentChip status={issue.payment.status} />
                      {(issue.payment.status === "PART_PAID" || issue.payment.status === "UNPAID") && (
                        <p className="font-tabular mt-0.5 text-xs text-ink-muted">{formatMoney(issue.payment.due)} left</p>
                      )}
                    </td>
                    <td className="font-tabular whitespace-nowrap px-4 py-3 text-ink-muted">
                      {formatDate(issue.issuedAt)}
                      <span className="ml-2 text-ink-faint">{formatTime(issue.issuedAt)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href={`/print/issue/${issue.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-accent hover:text-accent-hover"
                      >
                        Print
                      </a>
                    </td>
                  </ClickableRow>
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
