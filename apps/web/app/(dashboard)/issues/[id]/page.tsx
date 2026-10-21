"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ActionLink, BackLink, Card, DetailHeader, Facts, MoneyRow } from "@/components/ui/detail-parts";
import { DeliveryPaymentChip, StatusChip } from "@/components/ui/status-chip";
import { authFetch, ApiError } from "@/lib/api";
import {
  PAYMENT_METHOD_LABEL,
  RETURN_CONDITION_LABEL,
  formatDate,
  formatMoney,
  formatMoneyExact,
  formatMoneyPrecise,
  formatQty,
  formatTime,
} from "@/lib/format";
import type { DeliveryDetail, DeliveryPaymentStatus } from "@/lib/types";

const STATUS_SENTENCE: Record<DeliveryPaymentStatus, string> = {
  PAID: "This delivery is fully paid.",
  PART_PAID: "Part of this delivery has been paid. The rest is still owed.",
  UNPAID: "Nothing has been paid on this delivery yet.",
  RETURNED: "This delivery was returned in full, so nothing is owed on it.",
};

export default function DeliveryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [delivery, setDelivery] = useState<DeliveryDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    authFetch<DeliveryDetail>(`/issues/${id}/detail`)
      .then((d) => !cancelled && setDelivery(d))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Could not load this delivery."));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) return <p className="p-6 text-sm text-danger">{error}</p>;
  if (!delivery) return <p className="p-6 text-sm text-ink-muted">Loading…</p>;

  const { payment } = delivery;
  const hasReturns = Number(payment.returned) > 0;
  const hasDiscount = Number(delivery.discountAmount) > 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 pb-16">
      <div>
        <BackLink href="/issues">Deliveries</BackLink>
        <DetailHeader
          title={delivery.issueNumber}
          chips={<DeliveryPaymentChip status={payment.status} />}
          subtitle={
            <>
              Sent to <span className="font-medium text-ink">{delivery.customer.name}</span> on {formatDate(delivery.issuedAt)} at{" "}
              {formatTime(delivery.issuedAt)}
            </>
          }
          actions={<ActionLink href={`/print/issue/${delivery.id}`} newTab>Print again</ActionLink>}
        />
      </div>

      {delivery.status !== "ISSUED" && (
        <p className="rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">
          This delivery was cancelled{delivery.cancelReason ? `: ${delivery.cancelReason}` : "."}
        </p>
      )}

      <Card title="Is it paid?">
        <p className="mb-3 text-sm text-ink">{STATUS_SENTENCE[payment.status]}</p>
        <MoneyRow label="Delivery total" value={formatMoneyExact(payment.total)} />
        {hasReturns && <MoneyRow label="Returned by customer" value={`− ${formatMoneyExact(payment.returned)}`} note="credited back" />}
        <MoneyRow label="Paid" value={`− ${formatMoneyExact(payment.paid)}`} tone={Number(payment.paid) > 0 ? "success" : undefined} />
        <MoneyRow
          label="Still to pay"
          value={formatMoneyExact(payment.due)}
          strong
          tone={Number(payment.due) > 0 ? "danger" : "success"}
        />
      </Card>

      <Card title={`Items sent (${delivery.lines.length})`} flush>
        {hasReturns && (
          <div className="border-b border-warning/30 bg-warning-surface/60 px-4 py-2.5 text-xs text-warning">
            <span className="font-semibold">Note:</span> This delivery has returned items. Returned quantities and credited amounts are reflected below.
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2.5">Item</th>
                <th className="px-4 py-2.5 text-right">Delivered</th>
                {hasReturns && <th className="px-4 py-2.5 text-right">Returned</th>}
                {hasReturns && <th className="px-4 py-2.5 text-right">Net Billed</th>}
                <th className="px-4 py-2.5 text-right">Rate (PKR)</th>
                <th className="px-4 py-2.5 text-right">{hasReturns ? "Net Amount (PKR)" : "Amount (PKR)"}</th>
              </tr>
            </thead>
            <tbody>
              {delivery.lines.map((l) => {
                const returnedQty = Number(l.returnedQty ?? 0);
                const originalQty = Number(l.qty);
                const netQty = Number(l.netQty ?? Math.max(originalQty - returnedQty, 0));
                const isFullyReturned = returnedQty > 0 && netQty <= 0;
                const isPartiallyReturned = returnedQty > 0 && netQty > 0;

                return (
                  <tr
                    key={l.id}
                    className={`border-b border-border last:border-0 ${
                      isFullyReturned ? "bg-danger-surface/30" : isPartiallyReturned ? "bg-warning-surface/30" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5 text-ink">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`font-medium ${isFullyReturned ? "line-through text-ink-muted" : "text-ink"}`}>
                          {l.itemName}
                        </span>
                        {l.itemNameUrdu && (
                          <span className="text-xs text-ink-muted" dir="rtl">
                            ({l.itemNameUrdu})
                          </span>
                        )}
                        {isFullyReturned && (
                          <span className="rounded bg-danger-surface px-1.5 py-0.5 text-[10px] font-bold text-danger">
                            RETURNED FULL
                          </span>
                        )}
                        {isPartiallyReturned && (
                          <span className="rounded bg-warning-surface px-1.5 py-0.5 text-[10px] font-bold text-warning">
                            PARTIAL RETURN
                          </span>
                        )}
                      </div>
                      {l.notes && <p className="text-xs text-ink-faint">{l.notes}</p>}
                    </td>
                    <td className={`font-tabular px-4 py-2.5 text-right ${isFullyReturned ? "text-ink-muted line-through" : "text-ink"}`}>
                      {formatQty(l.qty, l.unitCode)}
                    </td>
                    {hasReturns && (
                      <td className="font-tabular px-4 py-2.5 text-right">
                        {returnedQty > 0 ? (
                          <span className="font-semibold text-warning">−{formatQty(l.returnedQty, l.unitCode)}</span>
                        ) : (
                          <span className="text-ink-faint">—</span>
                        )}
                      </td>
                    )}
                    {hasReturns && (
                      <td className="font-tabular px-4 py-2.5 text-right">
                        {returnedQty > 0 ? (
                          <span className={netQty === 0 ? "text-ink-faint" : "font-bold text-ink"}>
                            {formatQty(netQty, l.unitCode)}
                          </span>
                        ) : (
                          <span className="text-ink">{formatQty(l.qty, l.unitCode)}</span>
                        )}
                      </td>
                    )}
                    <td className="font-tabular px-4 py-2.5 text-right text-ink-muted">
                      {formatMoneyPrecise(l.unitPrice)}
                    </td>
                    <td className="font-tabular px-4 py-2.5 text-right">
                      {returnedQty > 0 ? (
                        <div>
                          <span className={`font-semibold ${isFullyReturned ? "text-ink-faint line-through" : "text-ink"}`}>
                            {formatMoneyPrecise(l.netLineTotal ?? "0")}
                          </span>
                          <span className="ml-1.5 text-xs text-ink-faint line-through">
                            {formatMoneyPrecise(l.lineTotal)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-ink">{formatMoneyPrecise(l.lineTotal)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border px-4 py-2">
          {hasDiscount && (
            <>
              <MoneyRow label="Items subtotal" value={formatMoneyExact(delivery.subtotal)} />
              <MoneyRow label="Discount" value={`− ${formatMoneyExact(delivery.discountAmount)}`} />
            </>
          )}
          {hasReturns ? (
            <>
              <MoneyRow label="Original Total" value={formatMoneyExact(delivery.totalAmount)} />
              <MoneyRow
                label="Less Returned Items"
                value={`− ${formatMoneyExact(delivery.returnedAmount ?? payment.returned)}`}
                note="credited to customer"
              />
              <MoneyRow
                label="REVISED DELIVERY TOTAL"
                value={formatMoneyExact(delivery.netTotal ?? Math.max(Number(delivery.totalAmount) - Number(payment.returned), 0))}
                strong
              />
            </>
          ) : (
            <MoneyRow label="Total" value={formatMoneyExact(delivery.totalAmount)} strong />
          )}
        </div>
      </Card>

      <Card title={`Payments received (${delivery.payments.length})`} flush={delivery.payments.length > 0}>
        {delivery.payments.length === 0 ? (
          <p className="text-sm text-ink-muted">No payment has been applied to this delivery yet.</p>
        ) : (
          <ul>
            {delivery.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 text-sm last:border-0">
                <div>
                  <Link href={`/payments/${p.paymentId}`} className="font-medium text-ink hover:text-accent">
                    {p.paymentNumber}
                  </Link>
                  <p className="text-xs text-ink-muted">
                    {formatDate(p.paymentDate)} · {PAYMENT_METHOD_LABEL[p.method] ?? p.method} · received by {p.receivedByName}
                    {p.reference ? ` · ref ${p.reference}` : ""}
                  </p>
                  {p.isReversed && <p className="text-xs text-danger">Reversed{p.reverseReason ? `: ${p.reverseReason}` : ""}. This no longer counts as paid.</p>}
                </div>
                <div className="flex items-center gap-3">
                  {p.isReversed && <StatusChip tone="danger">Reversed</StatusChip>}
                  <span className={`font-tabular ${p.isReversed ? "text-ink-faint line-through" : "text-ink"}`}>
                    {formatMoney(p.amountApplied)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {delivery.returns.length > 0 && (
        <Card title={`Returned from this delivery (${delivery.returns.length})`} flush>
          <ul>
            {delivery.returns.map((r) => (
              <li key={r.id} className="border-b border-border px-4 py-3 text-sm last:border-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Link href={`/returns/${r.id}`} className="font-medium text-ink hover:text-accent">
                      {r.returnNumber}
                    </Link>
                    <span className="ml-2 text-xs text-ink-muted">{formatDate(r.createdAt)}</span>
                  </div>
                  <span className="font-tabular text-ink">{formatMoney(r.totalCreditAmount)} credited</span>
                </div>
                <p className="mt-1 text-xs text-ink-muted">
                  {r.lines.map((l) => `${l.itemName} ${formatQty(l.qty, l.unitCode)} (${RETURN_CONDITION_LABEL[l.condition] ?? l.condition})`).join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Details">
        <Facts
          items={[
            {
              label: "Customer",
              value: (
                <Link href={`/customers/${delivery.customer.id}`} className="font-medium hover:text-accent">
                  {delivery.customer.name}
                </Link>
              ),
            },
            { label: "Phone", value: delivery.customer.phone ?? "—" },
            { label: "Issued by", value: delivery.issuedByName },
            { label: "Collected by", value: delivery.receivedByName ?? "—" },
            { label: "Printed", value: delivery.printCount === 0 ? "Not yet" : `${delivery.printCount} time${delivery.printCount === 1 ? "" : "s"}` },
            {
              label: "Customer account at the time",
              value: `${formatMoney(delivery.balanceBefore)} before → ${formatMoney(delivery.balanceAfter)} after this delivery`,
            },
            ...(delivery.notes ? [{ label: "Notes", value: delivery.notes }] : []),
          ]}
        />
      </Card>
    </div>
  );
}
