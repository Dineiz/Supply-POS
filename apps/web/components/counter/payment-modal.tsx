"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OverrideModal } from "@/components/shared/override-modal";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { Customer, OutstandingIssue, PaymentMethod } from "@/lib/types";

function previewAllocation(amount: number, outstanding: OutstandingIssue[]) {
  let remaining = amount;
  const allocations: { issueNumber: string; amount: number }[] = [];
  for (const issue of outstanding) {
    if (remaining <= 0) break;
    const balance = Number(issue.balance);
    const applied = Math.min(remaining, balance);
    if (applied > 0) allocations.push({ issueNumber: issue.issueNumber, amount: applied });
    remaining -= applied;
  }
  return { allocations, unallocated: remaining };
}

interface BlockInfo {
  message: string;
  periodLockedBefore: string;
}

export function PaymentModal({
  customer,
  onClose,
  onSuccess,
}: {
  customer: Customer;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [outstanding, setOutstanding] = useState<OutstandingIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [reference, setReference] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [block, setBlock] = useState<BlockInfo | null>(null);
  const [showOverride, setShowOverride] = useState(false);
  const [override, setOverride] = useState<{ authorizedById: string; authorizedByName: string; reason: string } | null>(
    null
  );

  useEffect(() => {
    authFetch<OutstandingIssue[]>(`/customers/${customer.id}/outstanding-issues`)
      .then(setOutstanding)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load unpaid orders."))
      .finally(() => setLoading(false));
  }, [customer.id]);

  const preview = useMemo(() => {
    const amt = Number(amount) || 0;
    if (amt <= 0) return null;
    return previewAllocation(amt, outstanding);
  }, [amount, outstanding]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setBlock(null);
    try {
      await authFetch("/payments", {
        method: "POST",
        body: JSON.stringify({
          customerId: customer.id,
          amount: Number(amount),
          method,
          reference: reference || undefined,
          paymentDate: paymentDate || undefined,
          approval: override ?? undefined,
        }),
      });
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.body && typeof err.body === "object" && "periodLockedBefore" in err.body) {
        setBlock(err.body as BlockInfo);
      } else {
        setError(err instanceof ApiError ? err.message : "Could not record the payment.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Modal title={`Record payment — ${customer.name}`} onClose={onClose}>
        <form onSubmit={handleSubmit} className="space-y-3 p-4">
          <p className="font-tabular text-sm text-ink-muted">
            Owes: {formatMoney(customer.currentBalance)}
          </p>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">Amount received</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className="h-11 w-full rounded-md border border-border-strong bg-paper px-3 text-sm text-ink"
            >
              <option value="CASH">Cash</option>
              <option value="BANK_TRANSFER">Bank transfer</option>
              <option value="JAZZCASH">JazzCash</option>
              <option value="EASYPAISA">Easypaisa</option>
              <option value="CHEQUE">Cheque</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-muted">
                Reference <span className="text-ink-faint">(optional)</span>
              </label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Cheque #, transaction ID, etc." />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-muted">
                Date <span className="text-ink-faint">(defaults to today)</span>
              </label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
          </div>

          {loading && <p className="text-xs text-ink-faint">Loading outstanding invoices…</p>}

          {preview && preview.allocations.length > 0 && (
            <div className="rounded-md border border-border bg-surface p-3 text-xs">
              <p className="mb-1 font-medium text-ink-muted">This will clear:</p>
              {preview.allocations.map((a) => (
                <p key={a.issueNumber} className="font-tabular text-ink">
                  {a.issueNumber}: {formatMoney(a.amount)}
                </p>
              ))}
              {preview.unallocated > 0 && (
                <p className="font-tabular mt-1 text-success">
                  + {formatMoney(preview.unallocated)} extra — saved for their next order
                </p>
              )}
            </div>
          )}

          {error && <p className="rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}

          {block && (
            <div className="rounded-md bg-danger-surface px-3 py-2 text-xs text-danger">
              <p>{block.message}</p>
              <button
                type="button"
                onClick={() => setShowOverride(true)}
                className="mt-2 font-medium underline underline-offset-2"
              >
                Get manager override
              </button>
            </div>
          )}

          {override && (
            <p className="rounded-md bg-success-surface px-3 py-2 text-xs text-success">
              Override approved by {override.authorizedByName}
            </p>
          )}

          <Button type="submit" disabled={submitting || !amount || Number(amount) <= 0} className="w-full">
            {submitting ? "Recording…" : "Record payment"}
          </Button>
        </form>
      </Modal>

      {showOverride && (
        <OverrideModal
          title="Manager override"
          description="This payment's date is before the cut-off set in Settings. A manager or owner must approve it."
          onClose={() => setShowOverride(false)}
          onAuthorized={(info) => {
            setOverride(info);
            setBlock(null);
            setShowOverride(false);
          }}
        />
      )}
    </>
  );
}
