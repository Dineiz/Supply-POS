import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
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
  addSeparateLine: (item: Item, initialQty?: number) => void;
  incrementLine: (lineId: string) => void;
  decrementLine: (lineId: string) => void;
  setLineQty: (lineId: string, qty: number) => void;
  setLineUnitPrice: (lineId: string, unitPrice: number) => void;
  removeLine: (lineId: string) => void;
  clearCart: () => void;
}

function generateLineId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `line_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Avoids floating-point drift (0.1 + 0.2 = 0.30000000000000004) while preserving up to 4 decimal places (e.g. 2.375 kg). */
function roundQty(qty: number): number {
  return Math.round(qty * 10000) / 10000;
}

function roundMoney(price: number): number {
  return Math.round(price * 100) / 100;
}

export const useCounterStore = create<CounterState>()(
  persist(
    (set, get) => ({
      items: [],
      customers: [],
      catalogueLoaded: false,
      setCatalogue: (items, customers) =>
        set((state) => ({
          items,
          customers,
          catalogueLoaded: true,
          // Sync any updated stock or details for items already in the cart
          lines: state.lines.map((line) => {
            const fresh = items.find((i) => i.id === line.itemId);
            if (!fresh) return { ...line, id: line.id || generateLineId() };
            return {
              ...line,
              id: line.id || generateLineId(),
              name: fresh.name,
              nameUrdu: fresh.nameUrdu,
              unitCode: fresh.unitCode,
              stockQty: Number(fresh.stockQty),
              avgCost: Number(fresh.avgCost),
            };
          }),
        })),

      customerId: null,
      setCustomerId: (id) => set({ customerId: id }),

      lines: [],
      addItem: (item) => {
        const matching = get().lines.filter((l) => l.itemId === item.id);
        if (matching.length > 0) {
          const target = matching[matching.length - 1]!;
          get().incrementLine(target.id);
          return;
        }
        get().addSeparateLine(item, 1);
      },
      addSeparateLine: (item, initialQty) => {
        const fractional = item.sellUnit.type !== "COUNT";
        const existing = get().lines.filter((l) => l.itemId === item.id);
        const lastLine = existing[existing.length - 1];
        const qty = initialQty ?? (lastLine ? lastLine.qty : 1);
        const unitPrice = lastLine ? lastLine.unitPrice : Number(item.price);
        set({
          lines: [
            ...get().lines,
            {
              id: generateLineId(),
              itemId: item.id,
              name: item.name,
              nameUrdu: item.nameUrdu,
              unitCode: item.unitCode,
              qty: roundQty(qty > 0 ? qty : 1),
              step: fractional ? 0.5 : 1,
              fractional,
              unitPrice: roundMoney(unitPrice),
              avgCost: Number(item.avgCost),
              stockQty: Number(item.stockQty),
            },
          ],
        });
      },
      incrementLine: (lineId) =>
        set({
          lines: get().lines.map((l) => (l.id === lineId ? { ...l, qty: roundQty(l.qty + l.step) } : l)),
        }),
      decrementLine: (lineId) => {
        const line = get().lines.find((l) => l.id === lineId);
        if (!line) return;
        const next = roundQty(line.qty - line.step);
        if (next <= 0) {
          get().removeLine(lineId);
          return;
        }
        set({
          lines: get().lines.map((l) => (l.id === lineId ? { ...l, qty: next } : l)),
        });
      },
      setLineQty: (lineId, qty) => {
        if (qty <= 0) {
          get().removeLine(lineId);
          return;
        }
        set({ lines: get().lines.map((l) => (l.id === lineId ? { ...l, qty: roundQty(qty) } : l)) });
      },
      setLineUnitPrice: (lineId, unitPrice) => {
        if (!Number.isFinite(unitPrice) || unitPrice <= 0) return;
        set({ lines: get().lines.map((l) => (l.id === lineId ? { ...l, unitPrice: roundMoney(unitPrice) } : l)) });
      },
      removeLine: (lineId) => set({ lines: get().lines.filter((l) => l.id !== lineId) }),
      clearCart: () => set({ lines: [], customerId: null }),
    }),
    {
      name: "dineiz_counter_cart",
      storage: createJSONStorage(() =>
        typeof window !== "undefined"
          ? window.localStorage
          : {
              getItem: () => null,
              setItem: () => {},
              removeItem: () => {},
            }
      ),
      onRehydrateStorage: () => (state) => {
        if (state?.lines) {
          state.lines = state.lines.map((l) => ({
            ...l,
            id: l.id || generateLineId(),
          }));
        }
      },
      partialize: (state) => ({
        customerId: state.customerId,
        lines: state.lines.map((l) => ({
          ...l,
          id: l.id || generateLineId(),
        })),
      }),
    }
  )
);
