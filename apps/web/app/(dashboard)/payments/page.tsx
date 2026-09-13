"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePresetFilter, type DateRange } from "@/components/filters/date-preset-filter";
import { Pagination } from "@/components/filters/pagination";
import { authFetch, ApiError } from "@/lib/api";
import { buildListQuery, type ListResponse } from "@/lib/list-query";
import { formatMoney } from "@/lib/format";
import type { PaymentListItem, PaymentMethod } from "@/lib/types";

const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  JAZZCASH: "JazzCash",
  EASYPAISA: "Easypaisa",
  CHEQUE: "Cheque",
};

export default function PaymentsPage() {
  const [payments, setPayments] = useState<PaymentListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [range, setRange] = useState<DateRange | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  function load() {
    setLoading(true);
    authFetch<ListResponse<PaymentListItem>>(`/payments?${buildListQuery({ range, page, pageSize })}`)
      .then((res) => {
        setPayments(res.rows);
        setTotal(res.total);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load payments."))
      .finally(() => setLoading(false));
  }

  useEffect(load, [range, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [range]);

  async function confirmReverse() {
    if (!reversingId || !reverseReason.trim()) return;
    setSubmitting(true);
    try {
      await authFetch(`/payments/${reversingId}/reverse`, {
        method: "POST",
        body: JSON.stringify({ reason: reverseReason }),
      });
      setReversingId(null);
      setReverseReason("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reverse the payment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Payments</h1>
        <p className="text-sm text-ink-muted">{total} payments on record</p>
      </div>

      <DatePresetFilter value={range} onChange={setRange} />

      {error && <p className="mb-4 rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-border bg-paper">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Status</th>
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
              {!loading && payments.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-ink-muted">
                    No payments yet.
                  </td>
                </tr>
              )}
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-surface">
                  <td className="px-4 py-3 font-medium text-ink">{p.paymentNumber}</td>
                  <td className="px-4 py-3 text-ink-muted">{p.customer.name}</td>
                  <td className="font-tabular px-4 py-3 text-ink-muted">
                    {new Date(p.paymentDate).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{METHOD_LABEL[p.method]}</td>
                  <td className={`font-tabular px-4 py-3 text-right ${p.isReversed ? "text-ink-faint line-through" : "text-ink"}`}>
                    {formatMoney(p.amount)}
                  </td>
                  <td className="px-4 py-3">
                    {p.isReversed ? (
                      <span className="rounded-full bg-danger-surface px-2 py-0.5 text-xs font-medium text-danger">
                        Reversed
                      </span>
                    ) : (
                      <span className="rounded-full bg-success-surface px-2 py-0.5 text-xs font-medium text-success">
                        Recorded
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!p.isReversed && (
                      <button
                        onClick={() => setReversingId(p.id)}
                        className="text-xs text-ink-muted hover:text-danger"
                      >
                        Reverse
                      </button>
                    )}
                  </td>
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

      {reversingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setReversingId(null)}>
          <div
            className="w-full max-w-sm rounded-lg border border-border bg-paper p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 text-sm font-semibold text-ink">Reverse this payment?</h2>
            <p className="mb-3 text-xs text-ink-muted">
              The customer&apos;s balance will go back up by this amount. This can&apos;t be undone — use it for a
              bounced cheque or a payment recorded on the wrong customer.
            </p>
            <label className="mb-1 block text-xs font-medium text-ink-muted">Reason</label>
            <input
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
              placeholder="e.g. cheque bounced"
              className="mb-3 h-10 w-full rounded-md border border-border-strong bg-paper px-3 text-sm text-ink"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setReversingId(null)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="button" variant="danger" onClick={confirmReverse} disabled={submitting || !reverseReason.trim()}>
                {submitting ? "Reversing…" : "Reverse payment"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
