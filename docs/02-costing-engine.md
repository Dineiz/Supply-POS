# Costing engine

Implementation: [`packages/logic/src/costing.ts`](../packages/logic/src/costing.ts).
Tests: [`packages/logic/src/costing.test.ts`](../packages/logic/src/costing.test.ts).
Design rationale: [`SPEC.md` Part 3](../SPEC.md#part-3--the-costing-engine).

## The method: weighted average moving cost

One item, one current average cost, updated on every receipt. Purchase lots
are recorded separately (for expiry/traceability/price history) but never
used for costing — see [03-schema.md](./03-schema.md#purchaselot).

## `calculateMovingAverage`

```
newQty        = currentQty + receivedQty
newTotalValue = (currentQty × currentAvgCost) + (receivedQty × receiptUnitCost)
newAvgCost    = newTotalValue / newQty
```

**Guard:** if `currentQty <= 0`, skip the blend entirely — the new average
*is* the receipt cost. This covers two of the spec's edge cases in one rule:
stock at exactly zero (first-ever receipt), and stock gone negative from an
override issue. Blending a non-positive quantity's "cost" with a real
receipt cost is not meaningful; resetting is the honest answer.

### Worked example (matches the spec's own numbers, and the test suite)

```
Before Thursday:  50 kg, value 7,000.00, cost 140.00/kg
Thursday receipt: +30 kg @ 152.00        = +4,560.00
After:            80 kg, value 11,560.00, cost 144.50/kg

calculateMovingAverage(50, 140, 30, 152) → 144.50  ✓ (costing.test.ts)
```

### Mid-week stockout example

```
Mon  Buy 50kg @ 140.  Stock 50, avg 140.00
Mon–Wed  Issue 50kg total.  Stock 0.  STOCKOUT.
Wed  Buy 30kg @ 152.  currentQty is 0 → reset, avg becomes 152.00 exactly
     (not blended with the stale 140.00)

calculateMovingAverage(0, 140, 30, 152) → 152.00
```

Selling price unchanged at 160 all week means the margin on issues before
the stockout (160 − 140 = 20/kg) is materially different from issues after
the re-buy (160 − 152 = 8/kg) — the same "week" now has two true margins.
This is exactly what the Margin Erosion report (Phase 8) surfaces.

## `calculateIssueCost`

```
costOfGoods = issuedQty × currentAvgCost
```

The caller freezes this value onto `issue_line.lineCost` at the moment of
issue and never recomputes it later — see
[03-schema.md](./03-schema.md#issueline) for why (a moved average must never
rewrite a closed transaction's cost).

## `calculateMarginPercent`

```
margin% = (sellPrice − avgCost) / sellPrice × 100
```

Guard: `sellPrice <= 0` returns `0` instead of dividing by zero. A negative
result (cost exceeds price) is returned as-is, not clamped — the owner needs
to see a real loss, not a floor of zero.

## Other pure functions in `packages/logic`

| Function | File | One-line purpose |
|---|---|---|
| `convertPurchaseToSellUnits` | `units.ts` | Purchase qty × conversion factor → sell-unit qty (e.g. 1 bag × 50 → 50 kg) |
| `calculateLineTotal` | `pricing.ts` | qty × price, less a line-level discount |
| `calculateIssueTotals` | `pricing.ts` | Sums lines, applies a customer-level blanket discount on top |
| `allocatePayment` | `payments.ts` | Oldest-invoice-first allocation; leftover becomes a credit balance |
| `calculateDaysOfCover` | `reorder.ts` | stockQty / avgDailyUsage, `Infinity` when there's no usage signal |
| `suggestReorderQty` | `reorder.ts` | Qty needed to reach a target days-of-cover, rounded up to a whole purchase unit |

All of the above are pure (`Decimal` in, `Decimal` out), have no database or
network access, and are covered by their own `*.test.ts` file.
