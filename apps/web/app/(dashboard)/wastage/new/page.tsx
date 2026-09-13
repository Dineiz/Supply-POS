"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OverrideModal } from "@/components/shared/override-modal";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { Item, WastageReason } from "@/lib/types";

const REASONS: { value: WastageReason; label: string }[] = [
  { value: "SPOILED", label: "Spoiled" },
  { value: "EXPIRED", label: "Expired" },
  { value: "DAMAGED", label: "Damaged" },
  { value: "PEST", label: "Pest" },
  { value: "THEFT", label: "Theft" },
  { value: "POWER_OUTAGE", label: "Power outage" },
  { value: "SPILLAGE", label: "Spillage" },
  { value: "QUALITY_REJECT", label: "Quality reject" },
  { value: "OTHER", label: "Other" },
];

interface BlockInfo {
  message: string;
  costImpact: string;
  threshold: string;
}

export default function NewWastagePage() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState<WastageReason | "">("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [block, setBlock] = useState<BlockInfo | null>(null);
  const [showOverride, setShowOverride] = useState(false);
  const [override, setOverride] = useState<{ authorizedById: string; authorizedByName: string; reason: string } | null>(
    null
  );

  useEffect(() => {
    authFetch<Item[]>("/items")
      .then(setItems)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load items."))
      .finally(() => setLoading(false));
  }, []);

  const item = items.find((i) => i.id === itemId) ?? null;
  const qtyNum = Number(qty) || 0;
  const avgCost = item ? Number(item.avgCost) : 0;
  const currentStock = item ? Number(item.stockQty) : 0;
  const actualQty = Math.min(qtyNum, Math.max(currentStock, 0));
  const clamped = qtyNum > 0 && actualQty < qtyNum;
  const costImpact = actualQty * avgCost;

  async function submit() {
    if (!itemId || !(qtyNum > 0) || !reason) {
      setError("Select an item, a positive quantity, and a reason.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await authFetch("/wastage", {
        method: "POST",
        body: JSON.stringify({
          itemId,
          qty: qtyNum,
          reason,
          notes: notes || undefined,
          approval: override ?? undefined,
        }),
      });
      router.push("/wastage");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setBlock(err.body as BlockInfo);
      } else {
        setError(err instanceof ApiError ? err.message : "Could not save the wastage record.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBlock(null);
    submit();
  }

  if (loading) return <p className="p-6 text-sm text-ink-muted">Loading…</p>;

  return (
    <>
      <form onSubmit={handleSubmit} className="mx-auto max-w-xl space-y-6 p-6 pb-16">
        <div>
          <h1 className="text-xl font-semibold text-ink">Log wastage</h1>
          <p className="text-sm text-ink-muted">Record stock lost to spoilage, damage, or other loss.</p>
        </div>

        {error && <p className="rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}

        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Item</label>
          <select
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            className="h-11 w-full rounded-md border border-border-strong bg-paper px-3 text-sm text-ink"
            required
          >
            <option value="">Select an item</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          {item && (
            <p className="font-tabular mt-1 text-xs text-ink-faint">
              In stock: {currentStock} {item.sellUnit.code.toLowerCase()} · avg cost {formatMoney(avgCost)}/
              {item.sellUnit.code.toLowerCase()}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">
              Qty {item ? `(${item.sellUnit.code.toLowerCase()})` : ""}
            </label>
            <Input type="number" step="any" min="0" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as WastageReason)}
              className="h-11 w-full rounded-md border border-border-strong bg-paper px-3 text-sm text-ink"
              required
            >
              <option value="">Select a reason</option>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">
            Notes <span className="text-ink-faint">(optional)</span>
          </label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {qtyNum > 0 && item && (
          <div className="rounded-lg border border-border p-4">
            <p className="font-tabular text-sm text-ink">
              This will cost you about: <span className="font-semibold">{formatMoney(costImpact)}</span>
            </p>
            {clamped && (
              <p className="mt-1 text-xs font-medium text-warning">
                ⚠ Only {currentStock} {item.sellUnit.code.toLowerCase()} is in stock — only that much will be
                recorded as lost.
              </p>
            )}
          </div>
        )}

        {block && (
          <div className="rounded-md bg-danger-surface px-3 py-2 text-xs text-danger">
            <p>{block.message}</p>
            <button onClick={() => setShowOverride(true)} type="button" className="mt-2 font-medium underline underline-offset-2">
              Get manager override
            </button>
          </div>
        )}

        {override && (
          <p className="rounded-md bg-success-surface px-3 py-2 text-xs text-success">
            Override approved by {override.authorizedByName}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-border pt-6">
          <Button type="button" variant="ghost" onClick={() => router.push("/wastage")}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>

      {showOverride && (
        <OverrideModal
          title="Manager override"
          description="This loss is bigger than what you can log without approval (set in Settings). A manager or owner must approve it."
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
