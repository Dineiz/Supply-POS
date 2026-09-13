import { describe, it, expect } from "vitest";
import { convertPurchaseToSellUnits } from "./units.js";

describe("convertPurchaseToSellUnits", () => {
  it("converts a 50kg bag into kilograms", () => {
    expect(convertPurchaseToSellUnits(1, 50).toNumber()).toBe(50);
  });

  it("handles a factor of 1 (purchase unit equals sell unit)", () => {
    expect(convertPurchaseToSellUnits(12, 1).toNumber()).toBe(12);
  });

  it("handles fractional purchase quantities", () => {
    expect(convertPurchaseToSellUnits(2.5, 50).toNumber()).toBe(125);
  });
});
