"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { authFetch, ApiError } from "@/lib/api";
import { getSessionUser } from "@/lib/session";
import type { WarehouseSettings } from "@/lib/types";

export default function SettingsPage() {
  const router = useRouter();
  const [wastageApprovalThreshold, setWastageApprovalThreshold] = useState("");
  const [countVarianceApprovalThreshold, setCountVarianceApprovalThreshold] = useState("");
  const [periodLockedBefore, setPeriodLockedBefore] = useState("");
  const [printMultipleTickets, setPrintMultipleTickets] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (getSessionUser()?.role !== "OWNER") {
      router.push("/reports");
      return;
    }
    authFetch<WarehouseSettings>("/warehouse")
      .then((w) => {
        setWastageApprovalThreshold(w.wastageApprovalThreshold);
        setCountVarianceApprovalThreshold(w.countVarianceApprovalThreshold);
        setPeriodLockedBefore(w.periodLockedBefore ? w.periodLockedBefore.slice(0, 10) : "");
        setPrintMultipleTickets(w.printMultipleTickets);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load settings."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await authFetch("/warehouse", {
        method: "PATCH",
        body: JSON.stringify({
          wastageApprovalThreshold: Number(wastageApprovalThreshold),
          countVarianceApprovalThreshold: Number(countVarianceApprovalThreshold),
          periodLockedBefore: periodLockedBefore || null,
          printMultipleTickets,
        }),
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="p-6 text-sm text-ink-muted">Loading…</p>;

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-xl space-y-8 p-6 pb-16">
      <div>
        <h1 className="text-xl font-semibold text-ink">Settings</h1>
        <p className="text-sm text-ink-muted">Warehouse-wide rules. Owner only.</p>
      </div>

      {error && <p className="rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}
      {saved && <p className="rounded-md bg-success-surface px-3 py-2 text-sm text-success">Saved.</p>}

      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-ink">When a manager must approve</h2>
        <p className="text-xs text-ink-muted">
          A loss or stock-count difference above these amounts is blocked until a manager or owner approves it.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">Block wastage above (PKR)</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={wastageApprovalThreshold}
              onChange={(e) => setWastageApprovalThreshold(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">Block stock-count difference above (PKR)</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={countVarianceApprovalThreshold}
              onChange={(e) => setCountVarianceApprovalThreshold(e.target.value)}
              required
            />
          </div>
        </div>
      </div>

      <div className="space-y-4 border-t border-border pt-6">
        <h2 className="text-sm font-semibold text-ink">Month-end close</h2>
        <p className="text-xs text-ink-muted">
          Once set, a payment dated before this date is blocked until a manager or owner approves it. Leave blank to
          allow any date freely.
        </p>
        <div className="w-56">
          <label className="mb-1 block text-xs font-medium text-ink-muted">Lock payments dated before</label>
          <Input type="date" value={periodLockedBefore} onChange={(e) => setPeriodLockedBefore(e.target.value)} />
        </div>
      </div>

      <div className="space-y-4 border-t border-border pt-6">
        <h2 className="text-sm font-semibold text-ink">Printing</h2>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-ink">Print a separate ticket per item</p>
            <p className="mt-0.5 text-xs text-ink-muted">
              The warehouse ticket splits into one ticket per item — for example, 5 kg Sugar and 1 kg Salt print as
              two separate tickets instead of one. The customer&apos;s bill is not affected.
            </p>
          </div>
          <Switch
            checked={printMultipleTickets}
            onChange={setPrintMultipleTickets}
            label="Print a separate ticket per item"
          />
        </div>
      </div>

      <div className="flex justify-end border-t border-border pt-6">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
