import { describe, it, expect } from "vitest";
import { planReceiptSlips, type SlipPlanInput } from "./receipt-pagination";

// Units are arbitrary; read them as mm. 1000 = a long bill's worth of rows.
const base = (over: Partial<SlipPlanInput> = {}): SlipPlanInput => ({
  itemHeights: Array(10).fill(10),
  topHeight: 60,
  bottomHeight: 80,
  continuedHeaderHeight: 20,
  continuedFooterHeight: 6,
  capacity: 297,
  ...over,
});

describe("planReceiptSlips", () => {
  it("keeps a bill that fits on one slip", () => {
    expect(planReceiptSlips(base())).toEqual([{ from: 0, to: 10 }]);
  });

  it("fits exactly at capacity", () => {
    // 60 + 15*10 + 80 = 290 <= 297; 60 + 16*10 + 80 = 300 > 297
    expect(planReceiptSlips(base({ itemHeights: Array(15).fill(10) }))).toHaveLength(1);
    expect(planReceiptSlips(base({ itemHeights: Array(16).fill(10) }))).toHaveLength(2);
  });

  it("splits a long bill at item boundaries and covers every item once, in order", () => {
    const slips = planReceiptSlips(base({ itemHeights: Array(45).fill(10) }));
    expect(slips.length).toBeGreaterThan(1);
    expect(slips[0]!.from).toBe(0);
    expect(slips.at(-1)!.to).toBe(45);
    slips.slice(1).forEach((s, i) => expect(s.from).toBe(slips[i]!.to));
  });

  it("never lets a slip exceed the paper length", () => {
    const itemHeights = Array.from({ length: 60 }, (_, i) => 6 + (i % 5));
    const input = base({ itemHeights });
    const slips = planReceiptSlips(input);
    slips.forEach((s, i) => {
      const rows = itemHeights.slice(s.from, s.to).reduce((a, b) => a + b, 0);
      const head = i === 0 ? input.topHeight : input.continuedHeaderHeight;
      const tail = i === slips.length - 1 ? input.bottomHeight : input.continuedFooterHeight;
      expect(head + rows + tail).toBeLessThanOrEqual(input.capacity);
    });
  });

  it("always gives the last slip at least one item to sit under the totals", () => {
    // Rows alone fit on slip 1 but the totals do not: 60 + 15*10 + 6 = 216 room-wise, + 80 > 297 at 20 rows.
    const slips = planReceiptSlips(base({ itemHeights: Array(16).fill(10), capacity: 300 - 5 }));
    expect(slips.length).toBe(2);
    expect(slips.at(-1)!.to - slips.at(-1)!.from).toBeGreaterThanOrEqual(1);
  });

  it("balances the split instead of leaving one lone item above the totals", () => {
    // Only just too long for one slip: greedy filling would leave a single item for the last slip.
    const slips = planReceiptSlips(base({ itemHeights: Array(16).fill(10) }));
    expect(slips).toHaveLength(2);
    expect(slips.at(-1)!.to - slips.at(-1)!.from).toBeGreaterThanOrEqual(4);
    expect(slips[0]!.to).toBe(slips[1]!.from);
  });

  it("splits into more slips when the paper is shorter", () => {
    const itemHeights = Array(30).fill(10);
    const long = planReceiptSlips(base({ itemHeights, capacity: 600 }));
    const short = planReceiptSlips(base({ itemHeights, capacity: 297 }));
    expect(long.length).toBeLessThan(short.length);
  });

  it("makes progress even when one row is taller than a slip", () => {
    const slips = planReceiptSlips(base({ itemHeights: [500, 500], capacity: 297 }));
    expect(slips.at(-1)!.to).toBe(2);
    expect(slips.length).toBeGreaterThanOrEqual(2);
  });

  it("handles a bill with no items", () => {
    expect(planReceiptSlips(base({ itemHeights: [] }))).toEqual([{ from: 0, to: 0 }]);
  });
});
