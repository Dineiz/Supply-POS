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

  // A customer buying less than one base unit (e.g. 250g off a per-kg rate)
  // is the normal case for loose/weighed goods, not an edge case — these
  // pin down exact decimal results so float rounding can never creep in.
  it("computes a fractional (sub-1-unit) quantity exactly, e.g. 250g at a per-kg rate", () => {
    expect(calculateLineTotal(0.25, 340).toNumber()).toBe(85);
  });

  it("computes a fractional quantity down to the schema's 4-decimal qty precision (1g)", () => {
    expect(calculateLineTotal(0.001, 340).toNumber()).toBe(0.34);
  });

  it("computes a fractional quantity that is not a round decimal, e.g. 333g", () => {
    expect(calculateLineTotal(0.333, 340).toNumber()).toBe(113.22);
  });

  it("applies a discount on top of a fractional quantity", () => {
    expect(calculateLineTotal(0.25, 340, 10).toNumber()).toBe(76.5);
  });

  it("computes a fractional quantity with a price that has its own cents", () => {
    expect(calculateLineTotal(0.1, 339.99).toNumber()).toBe(33.999);
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

  it("sums whole and fractional (sub-1-unit) quantities together without drift", () => {
    const totals = calculateIssueTotals([
      { qty: 0.25, unitPrice: 340, unitCost: 310 }, // 250g of a per-kg item
      { qty: 3, unitPrice: 160, unitCost: 144.5 },
      { qty: 0.5, unitPrice: 90, unitCost: 68 },
    ]);
    // 85 + 480 + 45
    expect(totals.subtotal.toNumber()).toBe(610);
    expect(totals.totalAmount.toNumber()).toBe(610);
    // 77.5 + 433.5 + 34
    expect(totals.totalCostAmount.toNumber()).toBe(545);
  });
});
