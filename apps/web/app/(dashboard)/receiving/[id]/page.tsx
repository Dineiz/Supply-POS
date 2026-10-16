"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { BackLink, Card, DetailHeader, Facts, MoneyRow } from "@/components/ui/detail-parts";
import { StatusChip, SupplierPaymentChip } from "@/components/ui/status-chip";
import { authFetch, ApiError } from "@/lib/api";
import { PAYMENT_METHOD_LABEL, formatDate, formatMoneyExact, formatMoneyPrecise, formatQty, formatTime } from "@/lib/format";
import type { GoodsReceiptDetail, PaymentMethod, SupplierPaymentStatus } from "@/lib/types";

const STATUS_SENTENCE: Record<SupplierPaymentStatus, string> = {
  PAID: "The supplier has been paid in full.",
  PART_PAID: "The supplier has been paid part of this. The rest is still owed.",
  NOT_RECORDED:
    "No payment to the supplier is recorded for this receipt. If it has been paid, use Record payment so it shows here.",
};

export default function ReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [receipt, setReceipt] = useState<GoodsReceiptDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  function load() {
    return authFetch<GoodsReceiptDetail>(`/goods-receipts/${id}`)
      .then(setReceipt)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load this receipt."));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error && !receipt) return <p className="p-6 text-sm text-danger">{error}</p>;
  if (!receipt) return <p className="p-6 text-sm text-ink-muted">Loading…</p>;

  const { payment } = receipt;
  const owed = Number(payment.due) > 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 pb-16">
      <div>
        <BackLink href="/receiving">Receiving</BackLink>
        <DetailHeader
          title={receipt.receiptNumber}
          chips={<SupplierPaymentChip status={payment.status} />}
          subtitle={
            <>
              Bought from <span className="font-medium text-ink">{receipt.supplier.name}</span>, received on{" "}
              {formatDate(receipt.receivedAt)} at {formatTime(receipt.receivedAt)}
            </>
          }
          actions={owed ? <Button onClick={() => setPaying(true)}>Record payment</Button> : undefined}
        />
      </div>

      <Card title="Have we paid the supplier?">
        <p className="mb-3 text-sm text-ink">{STATUS_SENTENCE[payment.status]}</p>
        <MoneyRow label="Receipt total" value={formatMoneyExact(payment.total)} />
        <MoneyRow label="Paid to supplier" value={`− ${formatMoneyExact(payment.paid)}`} tone={Number(payment.paid) > 0 ? "success" : undefined} />
        <MoneyRow label="Still owed" value={formatMoneyExact(payment.due)} strong tone={owed ? "warning" : "success"} />

        {receipt.payments.length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <p className="mb-1 text-xs font-medium text-ink-muted">Payments recorded</p>
            <ul>
              {receipt.payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5 text-sm">
                  <span className="text-ink-muted">
                    {formatDate(p.at)} · {p.method ? (PAYMENT_METHOD_LABEL[p.method] ?? p.method) : "—"} · by {p.recordedByName}
                    {p.notes ? ` · ${p.notes}` : ""}
                  </span>
                  <span className="font-tabular text-ink">{formatMoneyExact(p.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card title={`Items received (${receipt.lines.length})`} flush>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2.5">Item</th>
                <th className="px-4 py-2.5 text-right">Bought</th>
                <th className="px-4 py-2.5 text-right">Added to stock</th>
                <th className="px-4 py-2.5 text-right">Cost each (PKR)</th>
                <th className="px-4 py-2.5 text-right">Amount (PKR)</th>
              </tr>
            </thead>
            <tbody>
              {receipt.lines.map((l) => (
                <tr key={l.id} className="border-b border-border align-top last:border-0">
                  <td className="px-4 py-2.5 text-ink">
                    {l.itemName}
                    {l.varianceFlagged && (
                      <span className="ml-2">
                        <StatusChip tone="warning">
                          Price jumped{l.priceVariancePercent ? ` +${Number(l.priceVariancePercent).toFixed(0)}%` : ""}
                        </StatusChip>
                      </span>
                    )}
                    {(l.batchNumber || l.expiryDate) && (
                      <p className="text-xs text-ink-faint">
                        {l.batchNumber ? `Batch ${l.batchNumber}` : ""}
                        {l.batchNumber && l.expiryDate ? " · " : ""}
                        {l.expiryDate ? `Expires ${formatDate(l.expiryDate)}` : ""}
                      </p>
                    )}
                  </td>
                  <td className="font-tabular px-4 py-2.5 text-right text-ink">{formatQty(l.qtyInPurchaseUnit, l.purchaseUnitCode)}</td>
                  <td className="font-tabular px-4 py-2.5 text-right text-ink-muted">{formatQty(l.qtyInSellUnit, l.sellUnitCode)}</td>
                  <td className="font-tabular px-4 py-2.5 text-right text-ink-muted">
                    {formatMoneyPrecise(l.unitCostPurchaseUnit)}
                    <p className="text-xs text-ink-faint">{formatMoneyPrecise(l.unitCostSellUnit)} per {l.sellUnitCode.toLowerCase()}</p>
                  </td>
                  <td className="font-tabular px-4 py-2.5 text-right text-ink">{formatMoneyPrecise(l.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border px-4 py-2">
          <MoneyRow label="Total" value={formatMoneyExact(receipt.totalAmount)} strong />
        </div>
      </Card>

      <Card title="Details">
        <Facts
          items={[
            { label: "Supplier", value: receipt.supplier.name },
            { label: "Supplier phone", value: receipt.supplier.phone ?? "—" },
            { label: "Received by", value: receipt.receivedByName },
            { label: "Supplier invoice #", value: receipt.supplierInvoiceNumber ?? "—" },
            { label: "Invoice date", value: receipt.supplierInvoiceDate ? formatDate(receipt.supplierInvoiceDate) : "—" },
            ...(receipt.notes ? [{ label: "Notes", value: receipt.notes }] : []),
          ]}
        />
      </Card>

      {paying && (
        <RecordPaymentModal
          receiptId={receipt.id}
          receiptNumber={receipt.receiptNumber}
          due={payment.due}
          onClose={() => setPaying(false)}
          onSaved={() => {
            setPaying(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function RecordPaymentModal({
  receiptId,
  receiptNumber,
  due,
  onClose,
  onSaved,
}: {
  receiptId: string;
  receiptNumber: string;
  due: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(Number(due).toFixed(2));
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await authFetch(`/goods-receipts/${receiptId}/payments`, {
        method: "POST",
        body: JSON.stringify({ amount: Number(amount), method, notes: notes.trim() || undefined }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record the payment.");
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Record payment · ${receiptNumber}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 p-4">
        <p className="text-sm text-ink-muted">
          Still owed on this receipt: <span className="font-tabular font-medium text-ink">{formatMoneyExact(due)}</span>
        </p>
        {error && <p className="rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Amount paid (PKR)</label>
          <Input type="number" step="0.01" min="0.01" max={due} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">How it was paid</label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            className="h-11 w-full rounded-md border border-border-strong bg-paper px-3 text-sm text-ink"
          >
            {Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">
            Note <span className="text-ink-faint">(optional)</span>
          </label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. paid to the driver" />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !(Number(amount) > 0)}>
            {submitting ? "Saving…" : "Record payment"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
