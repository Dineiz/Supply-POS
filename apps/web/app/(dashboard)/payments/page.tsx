"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ClickableRow } from "@/components/ui/clickable-row";
import { StatStrip } from "@/components/ui/stat-strip";
import { StatusChip } from "@/components/ui/status-chip";
import { DatePresetFilter, type DateRange } from "@/components/filters/date-preset-filter";
import { PeriodEmpty } from "@/components/filters/period-empty";
import { Pagination } from "@/components/filters/pagination";
import { authFetch, ApiError } from "@/lib/api";
import { buildListQuery, type ListResponse } from "@/lib/list-query";
import { PAYMENT_METHOD_LABEL, formatDate, formatMoney, formatTime } from "@/lib/format";
import { todayRange } from "@/lib/period";
import type { PaymentListItem, PaymentListSummary } from "@/lib/types";

export default function PaymentsPage() {
  const [payments, setPayments] = useState<PaymentListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<PaymentListSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [range, setRange] = useState<DateRange | null>(todayRange);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setPage(1);
  }, [range]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    authFetch<ListResponse<PaymentListItem, PaymentListSummary>>(`/payments?${buildListQuery({ range, page, pageSize })}`)
      .then((res) => {
        if (cancelled) return;
        setPayments(res.rows);
        setTotal(res.total);
        setSummary(res.summary);
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Could not load payments."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [range, page, pageSize, reloadKey]);

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
      setReloadKey((k) => k + 1);
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
        <p className="text-sm text-ink-muted">Money received from customers. Click a payment to see which deliveries it paid for.</p>
      </div>

      <DatePresetFilter value={range} onChange={setRange} />

      {summary && (
        <StatStrip
          items={[
            { label: "Payments", value: String(summary.count) },
            { label: "Money received", value: formatMoney(summary.collectedAmount), tone: "success", hint: "Reversed payments not counted" },
            {
              label: "Reversed",
              value: String(summary.reversedCount),
              tone: summary.reversedCount > 0 ? "danger" : "default",
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
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Paid towards</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-ink-muted">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && payments.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <PeriodEmpty noun="payments" range={range} onChange={setRange} />
                  </td>
                </tr>
              )}
              {!loading &&
                payments.map((p) => (
                  <ClickableRow key={p.id} href={`/payments/${p.id}`}>
                    <td className="whitespace-nowrap px-4 py-3">
                      <Link href={`/payments/${p.id}`} className="font-medium text-ink hover:text-accent">
                        {p.paymentNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink">{p.customer.name}</td>
                    <td className={`font-tabular whitespace-nowrap px-4 py-3 text-right ${p.isReversed ? "text-ink-faint line-through" : "text-ink"}`}>
                      {formatMoney(p.amount)}
                    </td>
                    <td className="px-4 py-3">
                      {p.isReversed ? <StatusChip tone="danger">Reversed</StatusChip> : <StatusChip tone="success">Received</StatusChip>}
                    </td>
                    <td className="max-w-[220px] px-4 py-3 text-ink-muted">
                      {p.appliedTo.length === 0 && Number(p.onAccount) > 0 ? (
                        <span>Customer&apos;s account</span>
                      ) : (
                        <span className="block truncate" title={p.appliedTo.map((a) => a.issueNumber).join(", ")}>
                          {p.appliedTo.map((a) => a.issueNumber).join(", ")}
                          {Number(p.onAccount) > 0 ? " + account" : ""}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{PAYMENT_METHOD_LABEL[p.method] ?? p.method}</td>
                    <td className="font-tabular whitespace-nowrap px-4 py-3 text-ink-muted">
                      {formatDate(p.paymentDate)}
                      <span className="ml-2 text-ink-faint">{formatTime(p.paymentDate)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!p.isReversed && (
                        <button onClick={() => setReversingId(p.id)} className="text-xs text-ink-muted hover:text-danger">
                          Reverse
                        </button>
                      )}
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
