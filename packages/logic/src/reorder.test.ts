import { describe, it, expect } from "vitest";
import { calculateAverageDailyUsage, calculateDaysOfCover, suggestReorderQty } from "./reorder.js";

describe("calculateAverageDailyUsage", () => {
  it("averages only the non-stockout days", () => {
    const days = [
      { qty: 10, isStockoutDay: false },
      { qty: 0, isStockoutDay: true },
      { qty: 14, isStockoutDay: false },
      { qty: 0, isStockoutDay: true },
      { qty: 12, isStockoutDay: false },
    ];
    // (10 + 14 + 12) / 3, not / 5 -- the two stockout zeros are excluded, not averaged in
    expect(calculateAverageDailyUsage(days).toNumber()).toBeCloseTo(12, 5);
  });

  it("returns 0, not NaN, when every day was a stockout", () => {
    const days = [
      { qty: 0, isStockoutDay: true },
      { qty: 0, isStockoutDay: true },
    ];
    expect(calculateAverageDailyUsage(days).toNumber()).toBe(0);
  });

  it("returns 0 for an empty window", () => {
    expect(calculateAverageDailyUsage([]).toNumber()).toBe(0);
  });
});

describe("calculateDaysOfCover", () => {
  it("divides stock by daily usage", () => {
    expect(calculateDaysOfCover(12, 8.4).toNumber()).toBeCloseTo(1.4286, 3);
  });

  it("returns Infinity when there is no usage history, instead of dividing by zero", () => {
    expect(calculateDaysOfCover(50, 0).toNumber()).toBe(Infinity);
  });

  it("returns Infinity for a zero-stock, zero-usage item (no demand signal)", () => {
    expect(calculateDaysOfCover(0, 0).toNumber()).toBe(Infinity);
  });
});

describe("suggestReorderQty", () => {
  it("suggests enough to reach target days, rounded up to a whole purchase unit", () => {
    // stock 12kg, daily use 8.4kg, target 7 days -> need 46.8kg, round up to next 50kg bag
    const result = suggestReorderQty(12, 8.4, 7, 50);
    expect(result.toNumber()).toBe(50);
  });

  it("suggests zero when current stock comfortably exceeds the target", () => {
    const result = suggestReorderQty(200, 6.2, 7, 50);
    expect(result.toNumber()).toBe(0);
  });

  it("suggests zero when stock exactly meets the target", () => {
    const result = suggestReorderQty(70, 10, 7, 10);
    expect(result.toNumber()).toBe(0);
  });

  it("rounds up to more than one purchase unit when the gap is large", () => {
    // need 90kg more, bags are 50kg -> 2 bags (100kg)
    const result = suggestReorderQty(0, 18, 5, 50);
    expect(result.toNumber()).toBe(100);
  });
});
