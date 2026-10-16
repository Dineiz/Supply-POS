"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { BackLink, Card, DetailHeader, Facts, MoneyRow } from "@/components/ui/detail-parts";
import { StatusChip } from "@/components/ui/status-chip";
import { authFetch, ApiError } from "@/lib/api";
import {
  RETURN_CONDITION_LABEL,
  formatDate,
  formatMoney,
  formatMoneyExact,
  formatMoneyPrecise,
  formatQty,
  formatTime,
} from "@/lib/format";
import type { ReturnDetail } from "@/lib/types";

export default function ReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [note, setNote] = useState<ReturnDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    authFetch<ReturnDetail>(`/returns/${id}`)
      .then((d) => !cancelled && setNote(d))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Could not load this return."));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) return <p className="p-6 text-sm text-danger">{error}</p>;
  if (!note) return <p className="p-6 text-sm text-ink-muted">Loading…</p>;

  const lost = Number(note.totalCostWrittenOff);
  const backOnShelf = note.lines.filter((l) => l.restoredToStock).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 pb-16">
      <div>
        <BackLink href="/returns">Returns</BackLink>
        <DetailHeader
          title={note.returnNumber}
          subtitle={
            <>
              Returned by <span className="font-medium text-ink">{note.customer.name}</span> on {formatDate(note.createdAt)} at{" "}
              {formatTime(note.createdAt)}
            </>
          }
        />
      </div>

      <Card title="What happened to the money?">
        <p className="mb-3 text-sm text-ink">
          Nothing was paid out. {formatMoneyExact(note.totalCreditAmount)} was taken off what {note.customer.name} owes.
        </p>
        <MoneyRow label="Value of goods returned" value={formatMoneyExact(note.totalCreditAmount)} />
        <MoneyRow label="Customer owed before" value={formatMoneyExact(note.balanceBefore)} />
        <MoneyRow label="Customer owes now" value={formatMoneyExact(note.balanceAfter)} strong />
        <p className="mt-2 text-xs text-ink-faint">
          A negative amount means the customer is in credit with us. This is their balance at the moment of the return.
        </p>
      </Card>

      <Card title={`Items returned (${note.lines.length})`} flush>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2.5">Item</th>
                <th className="px-4 py-2.5 text-right">Returned</th>
                <th className="px-4 py-2.5 text-right">Rate (PKR)</th>
                <th className="px-4 py-2.5 text-right">Taken off (PKR)</th>
                <th className="px-4 py-2.5">Condition</th>
                <th className="px-4 py-2.5">Now</th>
              </tr>
            </thead>
            <tbody>
              {note.lines.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 text-ink">{l.itemName}</td>
                  <td className="font-tabular px-4 py-2.5 text-right text-ink">{formatQty(l.qty, l.unitCode)}</td>
                  <td className="font-tabular px-4 py-2.5 text-right text-ink-muted">{formatMoneyPrecise(l.creditUnitPrice)}</td>
                  <td className="font-tabular px-4 py-2.5 text-right text-ink">{formatMoneyPrecise(l.creditAmount)}</td>
                  <td className="px-4 py-2.5 text-ink-muted">{RETURN_CONDITION_LABEL[l.condition] ?? l.condition}</td>
                  <td className="px-4 py-2.5">
                    {l.restoredToStock ? (
                      <StatusChip tone="success">Back in stock</StatusChip>
                    ) : (
                      <StatusChip tone="warning">Written off</StatusChip>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border px-4 py-2">
          <MoneyRow label="Total taken off the bill" value={formatMoneyExact(note.totalCreditAmount)} strong />
          {lost > 0 && (
            <MoneyRow
              label="Cost lost on damaged or expired goods"
              value={formatMoneyExact(note.totalCostWrittenOff)}
              tone="warning"
              note={`${note.lines.length - backOnShelf} item${note.lines.length - backOnShelf === 1 ? "" : "s"} not put back`}
            />
          )}
        </div>
      </Card>

      <Card title="Details">
        <Facts
          items={[
            {
              label: "Customer",
              value: (
                <Link href={`/customers/${note.customer.id}`} className="font-medium hover:text-accent">
                  {note.customer.name}
                </Link>
              ),
            },
            {
              label: "Returned from delivery",
              value: note.originalIssue ? (
                <span>
                  <Link href={`/issues/${note.originalIssue.id}`} className="font-medium text-accent hover:text-accent-hover">
                    {note.originalIssue.issueNumber}
                  </Link>
                  <span className="ml-2 text-ink-muted">
                    {formatDate(note.originalIssue.issuedAt)} · {formatMoney(note.originalIssue.totalAmount)}
                  </span>
                </span>
              ) : (
                "Not linked to a delivery"
              ),
            },
            { label: "Brought back by", value: note.returnedByName ?? "—" },
            { label: "Accepted by", value: note.acceptedByName ?? "—" },
            { label: "Reason", value: note.reason ?? "—" },
            ...(note.notes ? [{ label: "Notes", value: note.notes }] : []),
          ]}
        />
      </Card>
    </div>
  );
}
