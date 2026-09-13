import { describe, it, expect } from "vitest";
import { calculateLineTotal, calculateIssueTotals } from "./pricing.js";

describe("calculateLineTotal", () => {
  it("computes qty * price with no discount", () => {
    expect(calculateLineTotal(5, 160).toNumber()).toBe(800);
  });

  it("applies a line discount percent", () => {
    expect(calculateLineTotal(5, 160, 10).toNumber()).toBe(720);
  });

  it("returns zero on a 100% discount", () => {
    expect(calculateLineTotal(5, 160, 100).toNumber()).toBe(0);
  });
});

describe("calculateIssueTotals", () => {
  it("sums multiple lines with no discount", () => {
    const totals = calculateIssueTotals([
      { qty: 5, unitPrice: 160, unitCost: 144.5 },
      { qty: 3, unitPrice: 360, unitCost: 310 },
      { qty: 4, unitPrice: 100, unitCost: 72.5 },
    ]);
    expect(totals.subtotal.toNumber()).toBe(2280);
    expect(totals.totalAmount.toNumber()).toBe(2280);
    expect(totals.totalCostAmount.toNumber()).toBe(1942.5);
    expect(totals.discountAmount.toNumber()).toBe(0);
  });

  it("applies a customer-level blanket discount on top of line totals", () => {
    const totals = calculateIssueTotals([{ qty: 10, unitPrice: 100, unitCost: 80 }], 5);
    expect(totals.subtotal.toNumber()).toBe(1000);
    expect(totals.totalAmount.toNumber()).toBe(950);
    expect(totals.discountAmount.toNumber()).toBe(50);
  });

  it("combines per-line discounts with a customer discount", () => {
    const totals = calculateIssueTotals(
      [{ qty: 10, unitPrice: 100, unitCost: 80, discountPercent: 10 }],
      10
    );
    // line: 1000 -> 900 after 10% line discount; customer: 900 -> 810 after 10%
    expect(totals.subtotal.toNumber()).toBe(900);
    expect(totals.totalAmount.toNumber()).toBe(810);
    expect(totals.discountAmount.toNumber()).toBe(190);
  });

  it("returns zeros for an empty line list", () => {
    const totals = calculateIssueTotals([]);
    expect(totals.subtotal.toNumber()).toBe(0);
    expect(totals.totalAmount.toNumber()).toBe(0);
    expect(totals.totalCostAmount.toNumber()).toBe(0);
  });
});
