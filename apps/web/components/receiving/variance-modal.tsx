"use client";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import type { FlaggedLine } from "@/lib/types";

export function VarianceModal({
  lines,
  onCancel,
  onConfirm,
  submitting,
}: {
  lines: FlaggedLine[];
  onCancel: () => void;
  onConfirm: () => void;
  submitting: boolean;
}) {
  return (
    <Modal title="Confirm price increase" onClose={onCancel}>
      <div className="p-4">
        <p className="text-sm text-ink-muted">
          These items are priced more than 50% above their current average cost. Double-check before saving.
        </p>
        <ul className="mt-3 divide-y divide-border rounded-md border border-border">
          {lines.map((l) => (
            <li key={l.itemId} className="px-3 py-2">
              <p className="text-sm font-medium text-ink">{l.name}</p>
              <p className="font-tabular text-xs text-warning">
                {formatMoney(l.currentAvgCost)} → {formatMoney(l.newCost)} (+{Number(l.variancePercent).toFixed(0)}%)
              </p>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={submitting}>
            {submitting ? "Saving…" : "Yes, prices are correct"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
