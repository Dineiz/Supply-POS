import { describe, it, expect } from "vitest";
import { allocateReturnQty } from "./return-allocation.js";

const line = (id: string, issueId: string, remainingQty: number | string) => ({ id, issueId, remainingQty });

describe("allocateReturnQty", () => {
  it("puts the whole return on the first line when it has enough left", () => {
    const r = allocateReturnQty(2, [line("l1", "i1", 5), line("l2", "i2", 5)]);
    expect(r.allocations.map((a) => [a.issueLineId, a.issueId, a.qty.toNumber()])).toEqual([["l1", "i1", 2]]);
    expect(r.unallocated.toNumber()).toBe(0);
  });

  it("spills into the next line, in the order given, when the first runs out", () => {
    const r = allocateReturnQty(7, [line("l1", "i1", 5), line("l2", "i2", 5)]);
    expect(r.allocations.map((a) => [a.issueLineId, a.qty.toNumber()])).toEqual([
      ["l1", 5],
      ["l2", 2],
    ]);
    expect(r.unallocated.toNumber()).toBe(0);
  });

  it("skips lines with nothing left to return", () => {
    const r = allocateReturnQty(1, [line("l1", "i1", 0), line("l2", "i2", 3)]);
    expect(r.allocations.map((a) => a.issueLineId)).toEqual(["l2"]);
  });

  it("reports what no delivery line can absorb as unallocated", () => {
    const r = allocateReturnQty(10, [line("l1", "i1", 4)]);
    expect(r.allocations.map((a) => a.qty.toNumber())).toEqual([4]);
    expect(r.unallocated.toNumber()).toBe(6);
  });

  it("leaves everything unallocated when the customer has no matching delivery line", () => {
    const r = allocateReturnQty(3, []);
    expect(r.allocations).toEqual([]);
    expect(r.unallocated.toNumber()).toBe(3);
  });

  it("allocates nothing for a zero or negative quantity", () => {
    expect(allocateReturnQty(0, [line("l1", "i1", 4)]).allocations).toEqual([]);
    expect(allocateReturnQty(-1, [line("l1", "i1", 4)]).unallocated.toNumber()).toBe(0);
  });

  it("is exact on fractional quantities", () => {
    const r = allocateReturnQty("0.75", [line("l1", "i1", "0.5"), line("l2", "i1", "0.5")]);
    expect(r.allocations.map((a) => a.qty.toString())).toEqual(["0.5", "0.25"]);
    expect(r.unallocated.toNumber()).toBe(0);
  });
});
