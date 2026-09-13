"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VarianceModal } from "@/components/receiving/variance-modal";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { FlaggedLine, Item, Supplier } from "@/lib/types";

interface ReceiptLineForm {
  itemId: string;
  qtyInPurchaseUnit: string;
  unitCostPurchaseUnit: string;
  batchNumber: string;
  expiryDate: string;
}

function emptyLine(): ReceiptLineForm {
  return { itemId: "", qtyInPurchaseUnit: "", unitCostPurchaseUnit: "", batchNumber: "", expiryDate: "" };
}

function NewReceiptForm() {
  const router = useRouter();
  const params = useSearchParams();
  const preselectItemId = params.get("itemId");
  const [items, setItems] = useState<Item[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [lines, setLines] = useState<ReceiptLineForm[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flaggedLines, setFlaggedLines] = useState<FlaggedLine[] | null>(null);

  useEffect(() => {
    Promise.all([authFetch<Item[]>("/items"), authFetch<Supplier[]>("/suppliers")])
      .then(([itemsRes, suppliersRes]) => {
        setItems(itemsRes);
        setSuppliers(suppliersRes);
        if (preselectItemId && itemsRes.some((i) => i.id === preselectItemId)) {
          setLines([{ ...emptyLine(), itemId: preselectItemId }]);
        }
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load form data."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateLine(index: number, patch: Partial<ReceiptLineForm>) {
    setLines((ls) => ls.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((ls) => [...ls, emptyLine()]);
  }

  function removeLine(index: number) {
    setLines((ls) => (ls.length > 1 ? ls.filter((_, i) => i !== index) : ls));
  }

  function lineInfo(line: ReceiptLineForm) {
    const item = items.find((i) => i.id === line.itemId);
    if (!item) return null;
    const factor = Number(item.purchaseToSellFactor) || 1;
    const qty = Number(line.qtyInPurchaseUnit) || 0;
    const cost = Number(line.unitCostPurchaseUnit) || 0;
    const qtyInSellUnit = qty * factor;
    const costPerSellUnit = factor > 0 ? cost / factor : cost;
    const avgCost = Number(item.avgCost);
    const variancePercent = avgCost > 0 ? ((costPerSellUnit - avgCost) / avgCost) * 100 : 0;
    const flagged = avgCost > 0 && costPerSellUnit > avgCost * 1.5;
    const lineTotal = qty * cost;
    return { item, qtyInSellUnit, costPerSellUnit, avgCost, variancePercent, flagged, lineTotal };
  }

  const validLines = lines.filter((l) => l.itemId && Number(l.qtyInPurchaseUnit) > 0 && l.unitCostPurchaseUnit !== "");
  const grandTotal = validLines.reduce((sum, l) => {
    const info = lineInfo(l);
    return sum + (info?.lineTotal ?? 0);
  }, 0);

  function buildPayload(acknowledgeVariance: boolean) {
    return {
      supplierId,
      supplierInvoiceNumber: invoiceNumber || undefined,
      supplierInvoiceDate: invoiceDate || undefined,
      lines: validLines.map((l) => ({
        itemId: l.itemId,
        qtyInPurchaseUnit: Number(l.qtyInPurchaseUnit),
        unitCostPurchaseUnit: Number(l.unitCostPurchaseUnit),
        batchNumber: l.batchNumber || undefined,
        expiryDate: l.expiryDate || undefined,
      })),
      acknowledgeVariance,
    };
  }

  async function submit(acknowledgeVariance: boolean) {
    setSubmitting(true);
    setError(null);
    try {
      await authFetch("/goods-receipts", { method: "POST", body: JSON.stringify(buildPayload(acknowledgeVariance)) });
      router.push("/receiving");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as { flaggedLines: FlaggedLine[] };
        setFlaggedLines(body.flaggedLines);
      } else {
        setError(err instanceof ApiError ? err.message : "Could not save the receipt.");
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
    if (validLines.length === 0) {
      setError("Add at least one line with an item, quantity, and cost.");
      return;
    }
    submit(false);
  }

  if (loading) return <p className="p-6 text-sm text-ink-muted">Loading…</p>;

  return (
    <>
      <form onSubmit={handleSubmit} className="mx-auto max-w-3xl space-y-8 p-6 pb-16">
        <div>
          <h1 className="text-xl font-semibold text-ink">New goods receipt</h1>
          <p className="text-sm text-ink-muted">Record what came in from a supplier.</p>
        </div>

        {error && <p className="rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-ink">Supplier</h2>
          <div className="grid grid-cols-2 gap-4">
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
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-muted">
                Supplier invoice # <span className="text-ink-faint">(optional)</span>
              </label>
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            </div>
          </div>
          <div className="w-48">
            <label className="mb-1 block text-xs font-medium text-ink-muted">
              Invoice date <span className="text-ink-faint">(optional)</span>
            </label>
            <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">Items received</h2>
          {lines.map((line, index) => {
            const info = lineInfo(line);
            return (
              <div key={index} className="rounded-lg border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="col-span-2 sm:col-span-4">
                      <label className="mb-1 block text-xs font-medium text-ink-muted">Item</label>
                      <select
                        value={line.itemId}
                        onChange={(e) => updateLine(index, { itemId: e.target.value })}
                        className="h-11 w-full rounded-md border border-border-strong bg-paper px-3 text-sm text-ink"
                      >
                        <option value="">Select an item</option>
                        {items.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-ink-muted">
                        Qty ({info?.item.purchaseUnit.code ?? "unit"})
                      </label>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        value={line.qtyInPurchaseUnit}
                        onChange={(e) => updateLine(index, { qtyInPurchaseUnit: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-ink-muted">
                        Cost / {info?.item.purchaseUnit.code ?? "unit"}
                      </label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.unitCostPurchaseUnit}
                        onChange={(e) => updateLine(index, { unitCostPurchaseUnit: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-ink-muted">
                        Batch <span className="text-ink-faint">(optional)</span>
                      </label>
                      <Input value={line.batchNumber} onChange={(e) => updateLine(index, { batchNumber: e.target.value })} />
                    </div>
                    {info?.item.isPerishable && (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-ink-muted">Expiry date</label>
                        <Input
                          type="date"
                          value={line.expiryDate}
                          onChange={(e) => updateLine(index, { expiryDate: e.target.value })}
                        />
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(index)}
                    className="mt-6 text-ink-faint hover:text-danger"
                    aria-label="Remove line"
                  >
                    ✕
                  </button>
                </div>

                {info && info.qtyInSellUnit > 0 && (
                  <p className="font-tabular mt-3 text-xs text-ink-muted">
                    = {info.qtyInSellUnit} {info.item.sellUnit.code.toLowerCase()} @{" "}
                    {formatMoney(info.costPerSellUnit)}/{info.item.sellUnit.code.toLowerCase()}
                    {info.avgCost > 0 && <> · current avg {formatMoney(info.avgCost)}</>}
                  </p>
                )}
                {info?.flagged && (
                  <p className="mt-1 text-xs font-medium text-warning">
                    ⚠ {info.variancePercent.toFixed(0)}% above the current average cost
                  </p>
                )}
              </div>
            );
          })}
          <Button type="button" variant="secondary" onClick={addLine}>
            + Add line
          </Button>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-6">
          <p className="font-tabular text-base font-semibold text-ink">Total: {formatMoney(grandTotal)}</p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => router.push("/receiving")}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save receipt"}
            </Button>
          </div>
        </div>
      </form>

      {flaggedLines && (
        <VarianceModal
          lines={flaggedLines}
          submitting={submitting}
          onCancel={() => setFlaggedLines(null)}
          onConfirm={() => submit(true)}
        />
      )}
    </>
  );
}

export default function NewReceiptPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-ink-muted">Loading…</p>}>
      <NewReceiptForm />
    </Suspense>
  );
}
