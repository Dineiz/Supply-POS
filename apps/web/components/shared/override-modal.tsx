"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authFetch, ApiError } from "@/lib/api";

export function OverrideModal({
  title,
  description,
  onClose,
  onAuthorized,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  onAuthorized: (info: { authorizedById: string; authorizedByName: string; reason: string }) => void;
}) {
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!reason.trim()) {
      setError("Enter a reason for the override.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await authFetch<{ authorized: boolean; authorizedById: string; authorizedByName: string }>(
        "/auth/authorize-override",
        { method: "POST", body: JSON.stringify({ pin, reason }) }
      );
      onAuthorized({ authorizedById: result.authorizedById, authorizedByName: result.authorizedByName, reason });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not verify override.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3 p-4">
        <p className="text-sm text-ink-muted">
          {description ?? "A manager or owner must approve this to continue."}
        </p>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Manager PIN</label>
          <Input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Reason</label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. trusted customer" />
        </div>
        {error && <p className="rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}
        <Button onClick={submit} disabled={loading || pin.length !== 4} className="w-full">
          {loading ? "Checking…" : "Approve"}
        </Button>
      </div>
    </Modal>
  );
}
