import { describe, it, expect } from "vitest";
import { ageLedgerDebits } from "./aging.js";

const d = (s: string) => new Date(s);

describe("ageLedgerDebits", () => {
  it("leaves a debit untouched when there is no credit", () => {
    const result = ageLedgerDebits([{ id: "a", date: d("2026-01-01"), amount: 100 }], []);
    expect(result[0]!.remaining.toNumber()).toBe(100);
  });

  it("consumes the oldest debit first", () => {
    const debits = [
      { id: "a", date: d("2026-01-01"), amount: 100 },
      { id: "b", date: d("2026-02-01"), amount: 50 },
    ];
    const result = ageLedgerDebits(debits, [{ amount: 100 }]);
    expect(result[0]!.remaining.toNumber()).toBe(0);
    expect(result[1]!.remaining.toNumber()).toBe(50);
  });

  it("spills a large credit across multiple debits, oldest first", () => {
    const debits = [
      { id: "a", date: d("2026-01-01"), amount: 100 },
      { id: "b", date: d("2026-02-01"), amount: 50 },
      { id: "c", date: d("2026-03-01"), amount: 80 },
    ];
    const result = ageLedgerDebits(debits, [{ amount: 120 }]);
    expect(result[0]!.remaining.toNumber()).toBe(0);
    expect(result[1]!.remaining.toNumber()).toBe(30);
    expect(result[2]!.remaining.toNumber()).toBe(80);
  });

  it("handles an opening balance the same as any other debit", () => {
    // A customer whose only debit is an opening balance, partially paid.
    const debits = [{ id: "opening", date: d("2026-01-01"), amount: 5400 }];
    const result = ageLedgerDebits(debits, [{ amount: 1000 }]);
    expect(result[0]!.remaining.toNumber()).toBe(4400);
  });

  it("a prepayment before any debit still ages the debit from its own date, net of the credit", () => {
    // Credit recorded before any debit exists (an advance/prepayment) --
    // pooling credits regardless of date still nets out correctly because
    // debits are always consumed oldest-first.
    const debits = [{ id: "a", date: d("2026-02-01"), amount: 100 }];
    const result = ageLedgerDebits(debits, [{ amount: 50 }]);
    expect(result[0]!.remaining.toNumber()).toBe(50);
    expect(result[0]!.date).toEqual(d("2026-02-01"));
  });

  it("leaves later debits fully outstanding once the credit pool is exhausted", () => {
    const debits = [
      { id: "a", date: d("2026-01-01"), amount: 30 },
      { id: "b", date: d("2026-02-01"), amount: 40 },
    ];
    const result = ageLedgerDebits(debits, [{ amount: 30 }]);
    expect(result[0]!.remaining.toNumber()).toBe(0);
    expect(result[1]!.remaining.toNumber()).toBe(40);
  });
});
