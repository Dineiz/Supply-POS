"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { Customer, IssueDetail, IssueSummary, Item, ReturnCondition } from "@/lib/types";

interface ReturnLineForm {
  itemId: string;
  issueLineId?: string;
  itemName: string;
  qty: string;
  maxQty?: number;
  condition: ReturnCondition;
  creditUnitPrice: string;
  windowHint?: string;
}

function emptyLine(): ReturnLineForm {
  return { itemId: "", itemName: "", qty: "", condition: "GOOD", creditUnitPrice: "" };
}

export function ReturnModal({
  customer,
  items,
  onClose,
  onSuccess,
}: {
  customer: Customer;
  items: Item[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [recentIssues, setRecentIssues] = useState<IssueSummary[]>([]);
  const [selectedIssueId, setSelectedIssueId] = useState("");
  const [issueDetail, setIssueDetail] = useState<IssueDetail | null>(null);
  const [lines, setLines] = useState<ReturnLineForm[]>([emptyLine()]);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authFetch<IssueSummary[]>(`/issues?customerId=${customer.id}`)
      .then(setRecentIssues)
      .catch(() => {});
  }, [customer.id]);

  useEffect(() => {
    if (!selectedIssueId) {
      setIssueDetail(null);
      setLines([emptyLine()]);
      return;
    }
    authFetch<IssueDetail>(`/issues/${selectedIssueId}`).then((detail) => {
      setIssueDetail(detail);
      const hoursSince = (Date.now() - new Date(detail.issuedAt).getTime()) / 3_600_000;
      setLines(
        detail.lines
          .filter((l) => Number(l.qty) - Number(l.returnedQty) > 0)
          .map((l) => {
            const outsideWindow = l.item.isPerishable && hoursSince > (l.item.returnWindowHours ?? 12);
            return {
              itemId: l.itemId,
              issueLineId: l.id,
              itemName: l.itemName,
              qty: "0",
              maxQty: Number(l.qty) - Number(l.returnedQty),
              condition: outsideWindow ? "DAMAGED" : "GOOD",
              creditUnitPrice: l.unitPrice,
              windowHint: outsideWindow
                ? `It's been over ${l.item.returnWindowHours ?? 12}h — this will be marked as spoiled, not put back on the shelf`
                : undefined,
            };
          })
      );
    });
  }, [selectedIssueId]);

  function updateLine(index: number, patch: Partial<ReturnLineForm>) {
    setLines((ls) => ls.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((ls) => [...ls, emptyLine()]);
  }

  function removeLine(index: number) {
    setLines((ls) => ls.filter((_, i) => i !== index));
  }

  function selectAdHocItem(index: number, itemId: string) {
    const item = items.find((i) => i.id === itemId);
    updateLine(index, { itemId, itemName: item?.name ?? "", creditUnitPrice: item?.price ?? "" });
  }

  const activeLines = lines.filter((l) => l.itemId && Number(l.qty) > 0);
  const totalCredit = activeLines.reduce((sum, l) => sum + Number(l.qty) * Number(l.creditUnitPrice || 0), 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (activeLines.length === 0) {
      setError("Enter a quantity for at least one item.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await authFetch("/returns", {
        method: "POST",
        body: JSON.stringify({
          customerId: customer.id,
          originalIssueId: selectedIssueId || undefined,
          reason: reason || undefined,
          lines: activeLines.map((l) => ({
            itemId: l.itemId,
            issueLineId: l.issueLineId,
            qty: Number(l.qty),
            condition: l.condition,
            creditUnitPrice: Number(l.creditUnitPrice),
          })),
        }),
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record the return.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Record return — ${customer.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4 p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">
            Which delivery is this for? <span className="text-ink-faint">(optional)</span>
          </label>
          <select
            value={selectedIssueId}
            onChange={(e) => setSelectedIssueId(e.target.value)}
            className="h-11 w-full rounded-md border border-border-strong bg-paper px-3 text-sm text-ink"
          >
            <option value="">No slip / not sure</option>
            {recentIssues.map((i) => (
              <option key={i.id} value={i.id}>
                {i.issueNumber} — {formatMoney(i.totalAmount)} ({new Date(i.issuedAt).toLocaleDateString("en-GB")})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-3">
          {lines.map((line, index) => (
            <div key={index} className="rounded-lg border border-border p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-2">
                  {line.issueLineId ? (
                    <p className="text-sm font-medium text-ink">{line.itemName}</p>
                  ) : (
                    <select
                      value={line.itemId}
                      onChange={(e) => selectAdHocItem(index, e.target.value)}
                      className="h-10 w-full rounded-md border border-border-strong bg-paper px-3 text-sm text-ink"
                    >
                      <option value="">Select an item</option>
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                  )}

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="mb-1 block text-xs text-ink-muted">
                        Qty {line.maxQty !== undefined && `(max ${line.maxQty})`}
                      </label>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        max={line.maxQty}
                        value={line.qty}
                        onChange={(e) => updateLine(index, { qty: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-ink-muted">Condition</label>
                      <select
                        value={line.condition}
                        onChange={(e) => updateLine(index, { condition: e.target.value as ReturnCondition })}
                        className="h-11 w-full rounded-md border border-border-strong bg-paper px-2 text-sm text-ink"
                      >
                        <option value="GOOD">Good</option>
                        <option value="DAMAGED">Damaged</option>
                        <option value="EXPIRED">Expired</option>
                        <option value="WRONG_ITEM">Wrong item</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-ink-muted">Amount back / unit</label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.creditUnitPrice}
                        onChange={(e) => updateLine(index, { creditUnitPrice: e.target.value })}
                        disabled={!!line.issueLineId}
                        className="disabled:bg-surface disabled:text-ink-muted"
                      />
                    </div>
                  </div>
                  {line.windowHint && <p className="text-xs font-medium text-warning">⚠ {line.windowHint}</p>}
                </div>
                {!line.issueLineId && (
                  <button
                    type="button"
                    onClick={() => removeLine(index)}
                    className="mt-1 text-ink-faint hover:text-danger"
                    aria-label="Remove line"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
          <Button type="button" variant="secondary" onClick={addLine}>
            + Add another item
          </Button>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">
            Reason <span className="text-ink-faint">(optional)</span>
          </label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. over-ordered" />
        </div>

        {error && <p className="rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex items-center justify-between border-t border-border pt-3">
          <p className="font-tabular text-sm font-semibold text-ink">Amount back: {formatMoney(totalCredit)}</p>
          <Button type="submit" disabled={submitting || activeLines.length === 0}>
            {submitting ? "Recording…" : "Record return"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
