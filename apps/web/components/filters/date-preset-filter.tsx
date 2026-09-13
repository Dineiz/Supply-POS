"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

export interface DateRange {
  from: string;
  to: string;
}

type PresetKey = "today" | "yesterday" | "week" | "month";

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function presetRange(key: PresetKey): DateRange {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (key === "today") return { from: isoDate(today), to: isoDate(today) };

  if (key === "yesterday") {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    return { from: isoDate(y), to: isoDate(y) };
  }

  if (key === "week") {
    const start = new Date(today);
    const daysSinceMonday = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - daysSinceMonday);
    return { from: isoDate(start), to: isoDate(today) };
  }

  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  return { from: isoDate(start), to: isoDate(today) };
}

function formatShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
];

export function DatePresetFilter({
  value,
  onChange,
}: {
  value: DateRange | null;
  onChange: (range: DateRange | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activePreset, setActivePreset] = useState<PresetKey | "custom" | null>(null);

  function pick(key: PresetKey) {
    setActivePreset(key);
    onChange(presetRange(key));
    setOpen(false);
  }

  function setCustom(next: DateRange) {
    setActivePreset("custom");
    onChange(next);
  }

  function clear() {
    setActivePreset(null);
    onChange(null);
    setOpen(false);
  }

  const label = !value
    ? "All dates"
    : activePreset && activePreset !== "custom"
      ? (PRESETS.find((p) => p.key === activePreset)?.label ?? "All dates")
      : value.from === value.to
        ? formatShort(value.from)
        : `${formatShort(value.from)} – ${formatShort(value.to)}`;

  return (
    <div className="relative mb-4 inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
          value ? "border-ink bg-ink text-white" : "border-border text-ink-muted hover:bg-surface hover:text-ink"
        }`}
      >
        {label}
        <span className={value ? "text-white/70" : "text-ink-faint"}>▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-11 z-50 w-72 overflow-hidden rounded-lg border border-border bg-paper shadow-lg">
            <div className="p-1">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => pick(p.key)}
                  className={`block w-full rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${
                    activePreset === p.key ? "bg-ink text-white" : "text-ink-muted hover:bg-surface hover:text-ink"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="border-t border-border p-3">
              <p className="mb-2 text-xs font-medium text-ink-muted">Custom range</p>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={value?.from ?? ""}
                  onChange={(e) => setCustom({ from: e.target.value, to: value?.to ?? e.target.value })}
                />
                <span className="text-ink-faint">–</span>
                <Input
                  type="date"
                  value={value?.to ?? ""}
                  onChange={(e) => setCustom({ from: value?.from ?? e.target.value, to: e.target.value })}
                />
              </div>
            </div>
            {value && (
              <button
                type="button"
                onClick={clear}
                className="block w-full border-t border-border px-3 py-2 text-left text-sm text-ink-muted hover:bg-surface hover:text-ink"
              >
                Clear filter
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
