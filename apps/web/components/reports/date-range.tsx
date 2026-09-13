"use client";

import { Input } from "@/components/ui/input";

export function DateRangeFilter({
  from,
  to,
  onFromChange,
  onToChange,
}: {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end gap-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-ink-muted">From</label>
        <Input type="date" value={from} onChange={(e) => onFromChange(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-ink-muted">To</label>
        <Input type="date" value={to} onChange={(e) => onToChange(e.target.value)} />
      </div>
    </div>
  );
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { from: isoDate(start), to: isoDate(now) };
}
