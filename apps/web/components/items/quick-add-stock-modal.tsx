"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { FlaggedLine, Item, Supplier } from "@/lib/types";

export function QuickAddStockModal({
  item,
  suppliers,
  onClose,
  onSaved,
}: {
  item: Item;
  suppliers: Supplier[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [supplierId, setSupplierId] = useState(item.preferredSupplierId ?? "");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flagged, setFlagged] = useState<FlaggedLine | null>(null);

  const factor = Number(item.purchaseToSellFactor) || 1;
  const qtyNum = Number(qty) || 0;
  const costNum = Number(cost) || 0;
  const qtyInSellUnit = qtyNum * factor;
  const costPerSellUnit = factor > 0 ? costNum / factor : costNum;

  async function submit(acknowledgeVariance: boolean) {
    setSubmitting(true);
    setError(null);
    try {
      await authFetch("/goods-receipts", {
        method: "POST",
        body: JSON.stringify({
          supplierId,
          lines: [
            {
              itemId: item.id,
              qtyInPurchaseUnit: qtyNum,
              unitCostPurchaseUnit: costNum,
              batchNumber: batchNumber || undefined,
              expiryDate: expiryDate || undefined,
            },
          ],
          acknowledgeVariance,
        }),
      });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as { flaggedLines?: FlaggedLine[] };
        setFlagged(body.flaggedLines?.[0] ?? null);
      } else {
        setError(err instanceof ApiError ? err.message : "Could not add stock.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierId) {
      setError("Select a supplier.");
      return;
    }
    setFlagged(null);
    submit(false);
  }

  return (
    <Modal title={`Add stock — ${item.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3 p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Supplier</label>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="h-11 w-full rounded-md border border-border-strong bg-paper px-3 text-sm text-ink"
            required
          >
            <option value="">Select a supplier</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">Qty ({item.purchaseUnit.code})</label>
            <Input type="number" step="any" min="0" value={qty} onChange={(e) => setQty(e.target.value)} required autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">Cost / {item.purchaseUnit.code}</label>
            <Input type="number" step="0.01" min="0" value={cost} onChange={(e) => setCost(e.target.value)} required />
          </div>
        </div>
        {item.isPerishable && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-muted">
                Batch <span className="text-ink-faint">(optional)</span>
              </label>
              <Input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-muted">Expiry date</label>
              <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            </div>
          </div>
        )}
        {qtyInSellUnit > 0 && (
          <p className="font-tabular rounded-md bg-surface px-3 py-2 text-sm text-ink-muted">
            = {qtyInSellUnit} {item.sellUnit.code.toLowerCase()} @ {formatMoney(costPerSellUnit)}/
            {item.sellUnit.code.toLowerCase()}
          </p>
        )}
        {flagged && (
          <div className="rounded-md bg-warning-surface px-3 py-2 text-xs text-warning">
            <p>This is {flagged.variancePercent}% above the current average cost.</p>
            <button
              type="button"
              onClick={() => submit(true)}
              className="mt-1 font-medium underline underline-offset-2"
              disabled={submitting}
            >
              Add it anyway
            </button>
          </div>
        )}
        {error && <p className="rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "Saving…" : "Add stock"}
        </Button>
      </form>
    </Modal>
  );
}
