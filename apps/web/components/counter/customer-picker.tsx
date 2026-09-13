"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";
import type { Customer } from "@/lib/types";

export function CustomerPicker({
  customers,
  onSelect,
  onClose,
}: {
  customers: Customer[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code?.toLowerCase().includes(q)
    );
  }, [customers, query]);

  return (
    <Modal title="Select customer" onClose={onClose}>
      <div className="p-3">
        <Input
          placeholder="Search customers…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>
      <ul className="divide-y divide-border">
        {filtered.map((c) => {
          const balance = Number(c.currentBalance);
          return (
            <li key={c.id}>
              <button
                onClick={() => onSelect(c.id)}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-surface"
              >
                <div>
                  <p className="text-sm font-medium text-ink">{c.name}</p>
                  <p className="font-tabular text-xs text-ink-muted">Owes {formatMoney(balance)}</p>
                </div>
              </button>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-ink-muted">No customers match.</li>
        )}
      </ul>
    </Modal>
  );
}
