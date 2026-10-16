"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  PERIOD_LABEL,
  describeRange,
  detectPeriod,
  presetRange,
  type DateRange,
  type PeriodKey,
} from "@/lib/period";

export type { DateRange } from "@/lib/period";

const PRESETS: PeriodKey[] = ["today", "yesterday", "last7", "month"];

/**
 * The single date control for every list and report. The presets are always
 * visible (not tucked in a menu) and the selected one is derived from the
 * value, so what is highlighted is always what is actually being shown.
 * Lists allow "All dates"; reports always need a real period.
 */
export function DatePresetFilter({
  value,
  onChange,
  allowAll = true,
}: {
  value: DateRange | null;
  onChange: (range: DateRange | null) => void;
  allowAll?: boolean;
}) {
  const kind = detectPeriod(value);
  const [customOpen, setCustomOpen] = useState(false);
  const showCustom = customOpen || kind === "custom";

  function pick(key: PeriodKey) {
    setCustomOpen(false);
    onChange(presetRange(key));
  }

  function openCustom() {
    setCustomOpen(true);
    // From "All dates" there is nothing to edit yet; start from today.
    if (!value) onChange(presetRange("today"));
  }

  function pickAll() {
    setCustomOpen(false);
    onChange(null);
  }

  function setFrom(from: string) {
    if (!from) return;
    const to = value?.to && value.to >= from ? value.to : from;
    onChange({ from, to });
  }

  function setTo(to: string) {
    if (!to) return;
    const from = value?.from && value.from <= to ? value.from : to;
    onChange({ from, to });
  }

  const buttonBase =
    "h-10 rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
  const selected = "border-ink bg-ink text-white";
  const idle = "border-border bg-paper text-ink-muted hover:bg-surface hover:text-ink";

  return (
    <div className="mb-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Date range">
        {PRESETS.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={!showCustom && kind === key}
            onClick={() => pick(key)}
            className={`${buttonBase} ${!showCustom && kind === key ? selected : idle}`}
          >
            {PERIOD_LABEL[key]}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={showCustom}
          onClick={openCustom}
          className={`${buttonBase} ${showCustom ? selected : idle}`}
        >
          Custom range
        </button>
        {allowAll && (
          <button
            type="button"
            aria-pressed={!showCustom && kind === "all"}
            onClick={pickAll}
            className={`${buttonBase} ${!showCustom && kind === "all" ? selected : idle}`}
          >
            All dates
          </button>
        )}
      </div>

      {showCustom && value && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">From</label>
            <Input type="date" value={value.from} max={value.to} onChange={(e) => setFrom(e.target.value)} className="w-44" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">To</label>
            <Input type="date" value={value.to} min={value.from} onChange={(e) => setTo(e.target.value)} className="w-44" />
          </div>
        </div>
      )}

      <p className="mt-2 text-xs font-medium text-ink-muted" aria-live="polite">
        {describeRange(value)}
      </p>
    </div>
  );
}
