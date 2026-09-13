"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { OverrideModal } from "@/components/shared/override-modal";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoney, formatDate } from "@/lib/format";
import type { StockCountSessionDetail } from "@/lib/types";

interface LineState {
  id: string;
  itemId: string;
  name: string;
  unitCode: string;
  systemQty: number;
  avgCostPerUnit: number;
  countedQty: string;
  savedQty: string;
}

interface BlockInfo {
  message: string;
  totalVarianceValue: string;
  threshold: string;
}

const TYPE_LABELS: Record<string, string> = { FULL: "Full", PARTIAL: "By category", SPOT: "Spot" };

export default function StockCountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<StockCountSessionDetail | null>(null);
  const [lines, setLines] = useState<LineState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [block, setBlock] = useState<BlockInfo | null>(null);
  const [showOverride, setShowOverride] = useState(false);
  const [override, setOverride] = useState<{ authorizedById: string; authorizedByName: string; reason: string } | null>(
    null
  );
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    load();
  }, [id]);

  function load() {
    setLoading(true);
    authFetch<StockCountSessionDetail>(`/stock-counts/${id}`)
      .then((s) => {
        setSession(s);
        setLines(
          s.lines.map((l) => ({
            id: l.id,
            itemId: l.itemId,
            name: l.item.name,
            unitCode: l.item.sellUnit.code,
            systemQty: Number(l.systemQty),
            avgCostPerUnit: Number(l.item.avgCostPerUnit),
            countedQty: l.countedQty,
            savedQty: l.countedQty,
          }))
        );
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load this count."))
      .finally(() => setLoading(false));
  }

  const inProgress = session?.status === "IN_PROGRESS";

  function updateDraft(lineId: string, value: string) {
    setLines((ls) => ls.map((l) => (l.id === lineId ? { ...l, countedQty: value } : l)));
  }

  async function saveLine(line: LineState) {
    const qty = Number(line.countedQty);
    if (!Number.isFinite(qty) || line.countedQty === line.savedQty) return;
    try {
      const result = await authFetch<{ countedQty: string }>(`/stock-counts/${id}/lines/${line.id}`, {
        method: "PATCH",
        body: JSON.stringify({ countedQty: qty }),
      });
      setLines((ls) =>
        ls.map((l) => (l.id === line.id ? { ...l, countedQty: result.countedQty, savedQty: result.countedQty } : l))
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save that line.");
    }
  }

  function variance(line: LineState) {
    const qty = Number(line.countedQty) || 0;
    return qty - line.systemQty;
  }

  function varianceValue(line: LineState) {
    return variance(line) * line.avgCostPerUnit;
  }

  const varianceLines = lines.filter((l) => variance(l) !== 0);
  const totalVarianceValue = varianceLines.reduce((sum, l) => sum + Math.abs(varianceValue(l)), 0);

  async function complete(approval?: { authorizedById: string; authorizedByName: string; reason: string }) {
    setCompleting(true);
    setError(null);
    try {
      await Promise.all(lines.filter((l) => l.countedQty !== l.savedQty).map(saveLine));
      await authFetch(`/stock-counts/${id}/complete`, {
        method: "POST",
        body: JSON.stringify({ approval: approval ?? override ?? undefined }),
      });
      load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setBlock(err.body as BlockInfo);
      } else {
        setError(err instanceof ApiError ? err.message : "Could not complete the count.");
      }
    } finally {
      setCompleting(false);
    }
  }

  async function confirmCancel() {
    setCancelling(true);
    try {
      await authFetch(`/stock-counts/${id}/cancel`, { method: "POST" });
      router.push("/stock-counts");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not cancel the count.");
      setCancelling(false);
      setShowCancelConfirm(false);
    }
  }

  if (loading) return <p className="p-6 text-sm text-ink-muted">Loading…</p>;
  if (!session) return <p className="p-6 text-sm text-danger">{error ?? "Count not found."}</p>;

  return (
    <>
      <div className="mx-auto max-w-4xl p-6 pb-16">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-ink">{session.countNumber}</h1>
            <p className="text-sm text-ink-muted">
              {TYPE_LABELS[session.type] ?? session.type} · Started by {session.startedByName ?? "—"} on{" "}
              {formatDate(session.startedAt)}
            </p>
          </div>
          {inProgress && (
            <Button variant="ghost" onClick={() => setShowCancelConfirm(true)}>
              Cancel count
            </Button>
          )}
        </div>

        {error && <p className="mb-4 rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="space-y-2 md:hidden">
          {lines.map((l) => {
            const v = variance(l);
            return (
              <div key={l.id} className="rounded-lg border border-border bg-paper p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-ink">{l.name}</p>
                  <p className="font-tabular shrink-0 text-xs text-ink-muted">
                    System: {l.systemQty} {l.unitCode.toLowerCase()}
                  </p>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <label className="text-xs font-medium text-ink-muted">Counted qty</label>
                  {inProgress ? (
                    <input
                      type="number"
                      step="any"
                      value={l.countedQty}
                      onChange={(e) => updateDraft(l.id, e.target.value)}
                      onBlur={() => saveLine(l)}
                      className="font-tabular h-10 w-32 rounded-md border border-border-strong bg-paper px-2 text-right text-base text-ink"
                    />
                  ) : (
                    <span className="font-tabular text-sm text-ink-muted">
                      {l.countedQty} {l.unitCode.toLowerCase()}
                    </span>
                  )}
                </div>
                {v !== 0 && (
                  <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-xs">
                    <span className={v > 0 ? "text-success" : "text-danger"}>
                      Difference: {v > 0 ? "+" : ""}
                      {v} {l.unitCode.toLowerCase()}
                    </span>
                    <span className="font-tabular text-ink">{formatMoney(varianceValue(l))}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="hidden overflow-hidden rounded-lg border border-border bg-paper md:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3 text-right">System qty</th>
                  <th className="px-4 py-3 text-right">Counted qty</th>
                  <th className="px-4 py-3 text-right">Difference</th>
                  <th className="px-4 py-3 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const v = variance(l);
                  return (
                    <tr key={l.id} className="border-b border-border last:border-0 hover:bg-surface">
                      <td className="px-4 py-3 text-ink">{l.name}</td>
                      <td className="font-tabular px-4 py-3 text-right text-ink-muted">
                        {l.systemQty} {l.unitCode.toLowerCase()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {inProgress ? (
                          <input
                            type="number"
                            step="any"
                            value={l.countedQty}
                            onChange={(e) => updateDraft(l.id, e.target.value)}
                            onBlur={() => saveLine(l)}
                            className="font-tabular h-9 w-28 rounded-md border border-border-strong bg-paper px-2 text-right text-sm text-ink"
                          />
                        ) : (
                          <span className="font-tabular text-ink-muted">
                            {l.countedQty} {l.unitCode.toLowerCase()}
                          </span>
                        )}
                      </td>
                      <td
                        className={`font-tabular px-4 py-3 text-right ${
                          v === 0 ? "text-ink-faint" : v > 0 ? "text-success" : "text-danger"
                        }`}
                      >
                        {v > 0 ? "+" : ""}
                        {v}
                      </td>
                      <td
                        className={`font-tabular px-4 py-3 text-right ${v === 0 ? "text-ink-faint" : "text-ink"}`}
                      >
                        {formatMoney(varianceValue(l))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between rounded-lg border border-border bg-paper p-4">
          <div className="text-sm">
            <p className="text-ink">
              <span className="font-semibold">{varianceLines.length}</span> of {lines.length} items don't match
            </p>
            <p className="font-tabular text-ink-muted">Total value of the difference: {formatMoney(totalVarianceValue)}</p>
          </div>
          {inProgress && (
            <Button onClick={() => complete()} disabled={completing}>
              {completing ? "Completing…" : "Complete count"}
            </Button>
          )}
          {session.status === "COMPLETED" && (
            <span className="rounded-full bg-success-surface px-3 py-1 text-xs font-medium text-success">
              Completed {session.completedAt ? formatDate(session.completedAt) : ""}
            </span>
          )}
        </div>

        {block && (
          <div className="mt-4 rounded-md bg-danger-surface px-3 py-2 text-xs text-danger">
            <p>{block.message}</p>
            <button onClick={() => setShowOverride(true)} className="mt-2 font-medium underline underline-offset-2">
              Get manager override
            </button>
          </div>
        )}

        {override && (
          <p className="mt-3 rounded-md bg-success-surface px-3 py-2 text-xs text-success">
            Override approved by {override.authorizedByName}
          </p>
        )}
      </div>

      {showOverride && (
        <OverrideModal
          title="Manager override"
          description="This difference is bigger than what you can save without approval (set in Settings). A manager or owner must approve it."
          onClose={() => setShowOverride(false)}
          onAuthorized={(info) => {
            setOverride(info);
            setBlock(null);
            setShowOverride(false);
            complete(info);
          }}
        />
      )}

      {showCancelConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setShowCancelConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-border bg-paper p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 text-sm font-semibold text-ink">Cancel this count?</h2>
            <p className="mb-3 text-xs text-ink-muted">
              Nothing counted so far will be saved to stock. This can&apos;t be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setShowCancelConfirm(false)} disabled={cancelling}>
                Keep counting
              </Button>
              <Button type="button" variant="danger" onClick={confirmCancel} disabled={cancelling}>
                {cancelling ? "Cancelling…" : "Cancel count"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
