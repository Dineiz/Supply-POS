"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DatePresetFilter, type DateRange } from "@/components/filters/date-preset-filter";
import { Pagination } from "@/components/filters/pagination";
import { authFetch, ApiError } from "@/lib/api";
import { buildListQuery, type ListResponse } from "@/lib/list-query";
import { formatMoney } from "@/lib/format";
import type { GoodsReceiptListItem } from "@/lib/types";

export default function ReceivingPage() {
  const [receipts, setReceipts] = useState<GoodsReceiptListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    setLoading(true);
    authFetch<ListResponse<GoodsReceiptListItem>>(`/goods-receipts?${buildListQuery({ range, page, pageSize })}`)
      .then((res) => {
        setReceipts(res.rows);
        setTotal(res.total);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load receipts."))
      .finally(() => setLoading(false));
  }, [range, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [range]);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Receiving</h1>
          <p className="text-sm text-ink-muted">{total} receipts on record</p>
        </div>
        <Link href="/receiving/new">
          <Button>+ New receipt</Button>
        </Link>
      </div>

      <DatePresetFilter value={range} onChange={setRange} />

      {error && <p className="mb-4 rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-border bg-paper">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3">Receipt</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Items</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Received by</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-ink-muted">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && receipts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-ink-muted">
                    No receipts yet.
                  </td>
                </tr>
              )}
              {receipts.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface">
                  <td className="px-4 py-3">
                    <span className="font-medium text-ink">{r.receiptNumber}</span>
                    {r.hadVariance && (
                      <span className="ml-2 rounded-full bg-warning-surface px-2 py-0.5 text-xs font-medium text-warning">
                        Price jumped
                      </span>
                    )}
                    {r.supplierInvoiceNumber && (
                      <p className="text-xs text-ink-faint">Invoice {r.supplierInvoiceNumber}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{r.supplier.name}</td>
                  <td className="font-tabular px-4 py-3 text-ink-muted">
                    {new Date(r.receivedAt).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="font-tabular px-4 py-3 text-right text-ink-muted">{r.lineCount}</td>
                  <td className="font-tabular px-4 py-3 text-right text-ink">{formatMoney(r.totalAmount)}</td>
                  <td className="px-4 py-3 text-ink-muted">{r.receivedByName}</td>
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
