"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { BackLink, Card, DetailHeader, Facts, MoneyRow } from "@/components/ui/detail-parts";
import { StatusChip } from "@/components/ui/status-chip";
import { authFetch, ApiError } from "@/lib/api";
import { PAYMENT_METHOD_LABEL, formatDate, formatMoney, formatMoneyExact, formatTime } from "@/lib/format";
import type { PaymentDetail } from "@/lib/types";

export default function PaymentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [payment, setPayment] = useState<PaymentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    authFetch<PaymentDetail>(`/payments/${id}`)
      .then((d) => !cancelled && setPayment(d))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Could not load this payment."));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) return <p className="p-6 text-sm text-danger">{error}</p>;
  if (!payment) return <p className="p-6 text-sm text-ink-muted">Loading…</p>;

  const onAccount = Number(payment.onAccountAmount);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 pb-16">
      <div>
        <BackLink href="/payments">Payments</BackLink>
        <DetailHeader
          title={payment.paymentNumber}
          chips={payment.isReversed ? <StatusChip tone="danger">Reversed</StatusChip> : <StatusChip tone="success">Received</StatusChip>}
          subtitle={
            <>
              <span className="font-medium text-ink">{formatMoneyExact(payment.amount)}</span> from{" "}
              <span className="font-medium text-ink">{payment.customer.name}</span> on {formatDate(payment.paymentDate)} at{" "}
              {formatTime(payment.paymentDate)}
            </>
          }
        />
      </div>

      {payment.isReversed && (
        <p className="rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">
          This payment was reversed{payment.reversedAt ? ` on ${formatDate(payment.reversedAt)}` : ""}
          {payment.reverseReason ? `: ${payment.reverseReason}` : ""}. It no longer counts as paid, and the customer owes this amount again.
        </p>
      )}

      <Card title="What did it pay for?">
        {payment.allocations.length === 0 && onAccount > 0 ? (
          <p className="text-sm text-ink">
            It was not tied to a delivery, so the full {formatMoneyExact(payment.amount)} sits on the customer&apos;s account as credit.
          </p>
        ) : (
          <>
            <ul className="-mx-4 -mt-1 mb-3">
              {payment.allocations.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5 text-sm last:border-0">
                  <div>
                    <Link href={`/issues/${a.issue.id}`} className="font-medium text-ink hover:text-accent">
                      {a.issue.issueNumber}
                    </Link>
                    <p className="text-xs text-ink-muted">
                      Delivered {formatDate(a.issue.issuedAt)} · delivery total {formatMoney(a.issue.totalAmount)}
                    </p>
                  </div>
                  <span className={`font-tabular ${payment.isReversed ? "text-ink-faint line-through" : "text-ink"}`}>
                    {formatMoneyExact(a.amountApplied)}
                  </span>
                </li>
              ))}
            </ul>
            {onAccount > 0 && (
              <MoneyRow label="Left on the customer's account as credit" value={formatMoneyExact(payment.onAccountAmount)} note="more than was owed" />
            )}
            <MoneyRow label="Total payment" value={formatMoneyExact(payment.amount)} strong />
          </>
        )}
      </Card>

      <Card title="Details">
        <Facts
          items={[
            {
              label: "Customer",
              value: (
                <Link href={`/customers/${payment.customer.id}`} className="font-medium hover:text-accent">
                  {payment.customer.name}
                </Link>
              ),
            },
            { label: "Method", value: PAYMENT_METHOD_LABEL[payment.method] ?? payment.method },
            { label: "Reference", value: payment.reference ?? "—" },
            { label: "Received by", value: payment.receivedByName },
            { label: "Paid by", value: payment.paidByName ?? "—" },
            {
              label: "Customer owed",
              value: `${formatMoneyExact(payment.balanceBefore)} before → ${formatMoneyExact(payment.balanceAfter)} after`,
            },
            ...(payment.notes ? [{ label: "Notes", value: payment.notes }] : []),
          ]}
        />
      </Card>
    </div>
  );
}
