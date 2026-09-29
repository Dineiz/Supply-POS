"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";

export function PriceEditor({
  unitPrice,
  onSetPrice,
}: {
  unitPrice: number;
  onSetPrice: (price: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function startEdit() {
    setDraft(String(unitPrice));
    setEditing(true);
  }

  function commit() {
    const next = Number(draft);
    if (Number.isFinite(next) && next > 0) onSetPrice(next);
    setEditing(false);
  }

  if (editing) {
    return (
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
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setEditing(false);
        }}
        className="font-tabular w-16 rounded border border-border-strong bg-paper px-1 py-0.5 text-xs text-ink outline-none focus:outline-2 focus:outline-offset-1 focus:outline-accent"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        startEdit();
      }}
      className="font-tabular cursor-text rounded px-0.5 font-medium text-accent underline decoration-dotted underline-offset-2 hover:bg-accent/10"
    >
      {formatMoney(unitPrice)}
    </button>
  );
}
