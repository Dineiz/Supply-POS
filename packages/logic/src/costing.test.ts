import { describe, it, expect } from "vitest";
import { calculateMovingAverage, calculateIssueCost, calculateMarginPercent } from "./costing.js";

describe("calculateMovingAverage", () => {
  it("blends two purchase layers by weighted average", () => {
    // Monday: 50kg @ 140, Thursday: +30kg @ 152 -> 144.50
    const result = calculateMovingAverage(50, 140, 30, 152);
    expect(result.toFixed(2)).toBe("144.50");
  });

  it("resets to the receipt cost when current stock is zero", () => {
    const result = calculateMovingAverage(0, 0, 20, 160);
    expect(result.toNumber()).toBe(160);
  });

  it("resets to the receipt cost when current stock is negative", () => {
    const result = calculateMovingAverage(-5, 140, 20, 160);
    expect(result.toNumber()).toBe(160);
  });

  it("accepts a zero receipt cost (free sample) and blends it down", () => {
    const result = calculateMovingAverage(50, 140, 50, 0);
    expect(result.toNumber()).toBe(70);
  });

  it("is a no-op when the received quantity is zero", () => {
    const result = calculateMovingAverage(50, 140, 0, 999);
    expect(result.toNumber()).toBe(140);
  });

  it("handles a second same-day receipt sequentially", () => {
    const afterFirst = calculateMovingAverage(50, 140, 30, 152);
    const afterSecond = calculateMovingAverage(80, afterFirst, 20, 160);
    // 80 * 144.50 = 11,560 ; 20 * 160 = 3,200 ; total 14,760 / 100 = 147.60
    expect(afterSecond.toFixed(2)).toBe("147.60");
  });
});

describe("calculateIssueCost", () => {
  it("multiplies quantity by the average cost", () => {
    expect(calculateIssueCost(5, 144.5).toNumber()).toBe(722.5);
  });

  it("is zero when avgCost is zero", () => {
    expect(calculateIssueCost(5, 0).toNumber()).toBe(0);
  });
});

describe("calculateMarginPercent", () => {
  it("computes margin as a percent of selling price", () => {
    const result = calculateMarginPercent(160, 144.5);
    expect(result.toFixed(2)).toBe("9.69");
  });

  it("returns zero when sell price is zero, instead of dividing by zero", () => {
    expect(calculateMarginPercent(0, 100).toNumber()).toBe(0);
  });

  it("returns a negative margin when cost exceeds price", () => {
    expect(calculateMarginPercent(100, 150).toNumber()).toBe(-50);
  });
});
