"use client";

import { useState } from "react";
import { formatQtyOnly, formatUnitCode } from "@/lib/format";

export function QtyStepper({
  qty,
  unitCode,
  fractional,
  onIncrement,
  onDecrement,
  onSetQty,
  size = "compact",
}: {
  qty: number;
  unitCode: string;
  fractional: boolean;
  onIncrement: () => void;
  onDecrement: () => void;
  onSetQty: (qty: number) => void;
  size?: "compact" | "spacious";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function startEdit() {
    if (!fractional) return;
    setDraft(formatQtyOnly(qty));
    setEditing(true);
  }

  function commit() {
    const next = Number(draft);
    if (Number.isFinite(next) && next > 0) onSetQty(next);
    setEditing(false);
  }

  const compact = size === "compact";
  const buttonSize = compact ? "h-6 w-6 text-sm" : "h-7 w-7 text-base";

  return (
    <div
      className={`inline-flex items-center rounded-full border border-accent bg-paper ${compact ? "gap-1 px-1 py-0.5" : "gap-1.5 px-1.5 py-1"}`}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={onDecrement}
        aria-label="Decrease quantity"
        className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-accent hover:bg-accent/10 ${buttonSize}`}
      >
        −
      </button>
      {editing ? (
        <input
          autoFocus
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setEditing(false);
          }}
          className={`font-tabular rounded border border-border-strong bg-paper text-center text-ink outline-none ${
            compact ? "w-11 text-xs" : "w-14 text-sm"
          }`}
        />
      ) : (
        <button
          type="button"
          onClick={startEdit}
          className={`font-tabular text-center font-medium text-ink ${fractional ? "cursor-text" : "cursor-default"} ${
            compact ? "min-w-[2.75rem] text-xs" : "min-w-[3.5rem] text-sm"
          }`}
        >
          {formatQtyOnly(qty)} {formatUnitCode(unitCode)}
        </button>
      )}
      <button
        type="button"
        onClick={onIncrement}
        aria-label="Increase quantity"
        className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-accent hover:bg-accent/10 ${buttonSize}`}
      >
        +
      </button>
    </div>
  );
}
