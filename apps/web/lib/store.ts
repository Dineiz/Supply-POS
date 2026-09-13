import { create } from "zustand";
import type { CartLine, Customer, Item } from "./types";

interface CounterState {
  items: Item[];
  customers: Customer[];
  catalogueLoaded: boolean;
  setCatalogue: (items: Item[], customers: Customer[]) => void;

  customerId: string | null;
  setCustomerId: (id: string | null) => void;

  lines: CartLine[];
  addItem: (item: Item) => void;
  incrementLine: (itemId: string) => void;
  decrementLine: (itemId: string) => void;
  setLineQty: (itemId: string, qty: number) => void;
  removeLine: (itemId: string) => void;
  clearCart: () => void;
}

export const useCounterStore = create<CounterState>((set, get) => ({
  items: [],
  customers: [],
  catalogueLoaded: false,
  setCatalogue: (items, customers) => set({ items, customers, catalogueLoaded: true }),

  customerId: null,
  setCustomerId: (id) => set({ customerId: id }),

  lines: [],
  addItem: (item) => {
    const existing = get().lines.find((l) => l.itemId === item.id);
    if (existing) {
      get().incrementLine(item.id);
      return;
    }
    set({
      lines: [
        ...get().lines,
        {
          itemId: item.id,
          name: item.name,
          unitCode: item.unitCode,
          qty: 1,
          unitPrice: Number(item.price),
          avgCost: Number(item.avgCost),
          stockQty: Number(item.stockQty),
        },
      ],
    });
  },
  incrementLine: (itemId) =>
    set({
      lines: get().lines.map((l) => (l.itemId === itemId ? { ...l, qty: l.qty + 1 } : l)),
    }),
  decrementLine: (itemId) => {
    const line = get().lines.find((l) => l.itemId === itemId);
    if (!line) return;
    if (line.qty <= 1) {
      get().removeLine(itemId);
      return;
    }
    set({
      lines: get().lines.map((l) => (l.itemId === itemId ? { ...l, qty: l.qty - 1 } : l)),
    });
  },
  setLineQty: (itemId, qty) => {
    if (qty <= 0) {
      get().removeLine(itemId);
      return;
    }
    set({ lines: get().lines.map((l) => (l.itemId === itemId ? { ...l, qty } : l)) });
  },
  removeLine: (itemId) => set({ lines: get().lines.filter((l) => l.itemId !== itemId) }),
  clearCart: () => set({ lines: [], customerId: null }),
}));
