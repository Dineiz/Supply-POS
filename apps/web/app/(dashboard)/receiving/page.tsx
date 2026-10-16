"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ClickableRow } from "@/components/ui/clickable-row";
import { StatusChip, SupplierPaymentChip } from "@/components/ui/status-chip";
import { StatStrip } from "@/components/ui/stat-strip";
import { DatePresetFilter, type DateRange } from "@/components/filters/date-preset-filter";
import { PeriodEmpty } from "@/components/filters/period-empty";
import { Pagination } from "@/components/filters/pagination";
import { authFetch, ApiError } from "@/lib/api";
import { buildListQuery, type ListResponse } from "@/lib/list-query";
import { formatDate, formatMoney, formatTime, summarizeItems } from "@/lib/format";
import { todayRange } from "@/lib/period";
import type { GoodsReceiptListItem, GoodsReceiptListSummary } from "@/lib/types";

export default function ReceivingPage() {
  const [receipts, setReceipts] = useState<GoodsReceiptListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<GoodsReceiptListSummary | null>(null);
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
    authFetch<ListResponse<GoodsReceiptListItem, GoodsReceiptListSummary>>(
      `/goods-receipts?${buildListQuery({ range, page, pageSize })}`
    )
      .then((res) => {
        if (cancelled) return;
        setReceipts(res.rows);
        setTotal(res.total);
        setSummary(res.summary);
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Could not load receipts."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [range, page, pageSize]);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Receiving</h1>
          <p className="text-sm text-ink-muted">Everything bought and brought in. Click a receipt to see every item and whether the supplier is paid.</p>
        </div>
        <Link href="/receiving/new">
          <Button>+ New receipt</Button>
        </Link>
      </div>

      <DatePresetFilter value={range} onChange={setRange} />

      {summary && (
        <StatStrip
          items={[
            { label: "Receipts", value: String(summary.count) },
            { label: "Total bought", value: formatMoney(summary.totalAmount) },
            { label: "Paid to suppliers", value: formatMoney(summary.paidAmount), tone: "success" },
            {
              label: "Not paid yet",
              value: formatMoney(summary.dueAmount),
              tone: Number(summary.dueAmount) > 0 ? "warning" : "default",
              hint: "Only payments recorded in this system",
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
                <th className="px-4 py-3">Receipt</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Items received</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Received by</th>
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
              {!loading && receipts.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <PeriodEmpty noun="receipts" range={range} onChange={setRange} />
                  </td>
                </tr>
              )}
              {!loading &&
                receipts.map((r) => (
                  <ClickableRow key={r.id} href={`/receiving/${r.id}`}>
                    <td className="whitespace-nowrap px-4 py-3">
                      <Link href={`/receiving/${r.id}`} className="font-medium text-ink hover:text-accent">
                        {r.receiptNumber}
                      </Link>
                      {r.hadVariance && (
                        <span className="ml-2">
                          <StatusChip tone="warning">Price jumped</StatusChip>
                        </span>
                      )}
                      {r.supplierInvoiceNumber && <p className="text-xs text-ink-faint">Invoice {r.supplierInvoiceNumber}</p>}
                    </td>
                    <td className="px-4 py-3 text-ink">{r.supplier.name}</td>
                    <td className="max-w-[220px] px-4 py-3 text-ink-muted">
                      <span className="block truncate" title={r.items.map((i) => i.name).join(", ")}>
                        {summarizeItems(r.items, 2)}
                      </span>
                    </td>
                    <td className="font-tabular whitespace-nowrap px-4 py-3 text-right text-ink">{formatMoney(r.totalAmount)}</td>
                    <td className="px-4 py-3">
                      <SupplierPaymentChip status={r.payment.status} />
                      {r.payment.status === "PART_PAID" && (
                        <p className="font-tabular mt-0.5 text-xs text-ink-muted">{formatMoney(r.payment.due)} left</p>
                      )}
                    </td>
                    <td className="font-tabular whitespace-nowrap px-4 py-3 text-ink-muted">
                      {formatDate(r.receivedAt)}
                      <span className="ml-2 text-ink-faint">{formatTime(r.receivedAt)}</span>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{r.receivedByName}</td>
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
