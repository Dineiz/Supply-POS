# Schema

Authoritative schema: [`packages/db/prisma/schema.prisma`](../packages/db/prisma/schema.prisma).
This file explains *why* each model and its non-obvious fields exist. Field
lists here are illustrative, not exhaustive — read the `.prisma` file for the
exact, current field set and types.

Cross-cutting rules (apply to every model below):
- Every tenant-scoped model carries `warehouseId` — multi-warehouse from day
  one (see [01-architecture.md](./01-architecture.md#multi-tenancy)).
- Money is `Decimal @db.Decimal(14,2)`, quantities `Decimal @db.Decimal(14,4)`
  — see [ADR-001](./06-decisions.md#adr-001-decimaljs-for-all-money-and-quantity-math).
- IDs are `cuid()` — see [ADR-005](./06-decisions.md#adr-005-cuid-for-all-primary-keys).

## Warehouse

The tenant root. Holds settings (`currency`, `timezone`, document number
prefixes, `defaultMarginFloorPercent`, `defaultReturnWindowHours`) so
per-warehouse behaviour doesn't need code changes. Also holds the
manager-override thresholds (`wastageApprovalThreshold`,
`countVarianceApprovalThreshold`) and `periodLockedBefore` — a nullable
month-end-close date; a `Payment` dated before it is blocked without an
override (Phase 9). All four are editable at `/settings`, `OWNER` only.

## User

`role`: `OWNER | MANAGER | CLERK | VIEWER`. Managers/owners authenticate with
email+password; clerks use a 4-digit `pinHash` for fast counter login (Part 7
of the spec — speed at the counter is a hard requirement). `email` is
nullable and unique *per warehouse*, not globally, since a clerk may have no
email at all.

## Unit

Just `code`, `name`, `type` — no conversion between units. A unit like "Bag
(20kg)" is defined once, standing on its own; how it relates to "Kilogram" is
recorded a single time, per item, via `item.purchaseToSellFactor` (see
**Item** below). An earlier version had units declare a `factorToBase`
against a `baseUnitId`, but nothing ever read it — `purchaseToSellFactor` was
always the actual, used conversion — so it was pure duplicate data entry and
was removed (migration `20260913205508_remove_unit_conversion_fields`).

## Category

`isPerishable` and `defaultReturnWindowHours` here are *category-level
defaults*; `Item` can override both. `colorHex` is for visual grouping on the
counter screen grid (Part 7).

## Item

The catalogue. Two non-obvious fields carry the whole unit-conversion design:

- `purchaseUnitId` / `sellUnitId` — how you buy vs. how you sell (e.g. BAG
  vs. KG). Can be the same unit.
- `purchaseToSellFactor` — e.g. 50 (1 bag = 50kg).
- **`currentStockQty` and `avgCostPerUnit` are always in sell units.**
  Conversion happens exactly once, at goods receipt (Phase 3), never again.
  This is the single most important invariant in the schema — see
  [01-architecture.md](./01-architecture.md#money-and-quantity-representation).

`avgCostPerUnit` is the live weighted-average cost computed by
`calculateMovingAverage` (see [02-costing-engine.md](./02-costing-engine.md))
— it changes on every receipt and is read, never written, by an issue.

`reorderDays` (Phase 8, nullable) is a target days-of-cover, not a fixed
quantity — it's what the Reorder Suggestions report compares against trailing
usage. `null` means "not tracked," never flagged. This is deliberately a
second, independent signal from `minStockQty` (a fixed quantity floor,
checked at the counter): one is velocity-based, the other a static line.

## PurchaseLot

**Not used for costing** (see costing engine doc). Exists purely for expiry
tracking (`expiryDate`, guides the picking slip's "issue oldest crate first"),
price history, batch traceability, and supplier performance — the FIFO-like
audit trail the business needs even though pricing is average-based.

## StockMovement

The append-only ledger of every quantity change to an item, of any kind
(`PURCHASE_RECEIVED | ISSUE | RETURN_IN | WASTAGE | ADJUSTMENT | OPENING |
TRANSFER_OUT | TRANSFER_IN | SUPPLIER_RETURN`). Stores `qtyBefore/qtyAfter`
and `avgCostBefore/avgCostAfter` on every row — this is what makes the
moving-average history reconstructable and auditable after the fact, and
what the nightly reconciliation job (Phase 9) sums to verify
`item.currentStockQty`. **Nothing may change stock without writing a row
here, in the same database transaction as the stock change.**

## Customer

`type`: `OWN_BRANCH | EXTERNAL_RESTAURANT | WALK_IN`. `currentBalance` is
denormalised (see cross-cutting rules) and is the number the counter screen
shows instantly — never computed by summing `CustomerLedger` on read.
`creditLimit`/`creditDays` back the soft-block rules in
[`SPEC.md` Part 5](../SPEC.md#part-5--payments-and-credit).

## CustomerPrice

Per-customer, per-item price override with a validity window
(`validFrom`/`validTo`), so a price change doesn't rewrite history for past
issues (which froze their own `unitPrice` anyway — see **IssueLine**).

## Supplier

Mirrors `Customer` but for the buy side. `currentPayable` is a placeholder
denormalised field for a future payables ledger (explicitly out of scope —
see `SPEC.md` Part 0, question 5 — would be "Phase 10").

## Issue (the delivery slip / KOT)

`status`: `DRAFT | ISSUED | CANCELLED` — cancellation is a status change plus
a reversing ledger entry, **never a delete or edit of the original row**.
`balanceBefore`/`balanceAfter` are captured at issue time so a printed slip
and the ledger always agree on what the balance was at that moment, even if
later corrections change the *current* balance. `printCount` supports the
"REPRINT — COPY n" rule (Part 8 of the spec).

## IssueLine

**Freezes `itemName`, `itemNameUrdu`, `unitCode`, `unitPrice`, and
`unitCost`** at the moment of issue. If the item is renamed or repriced next
month, last month's slip must still read exactly as printed — this is a
hard requirement, not a convenience. `lineCost` is the frozen output of
`calculateIssueCost`, never recomputed from a later average.
`returnedQty` is a running total so a return can validate "not more than was
issued" without re-summing `ReturnLine` every time.

## ReturnNote / ReturnLine

One return can reference an original `Issue` (`originalIssueId`, nullable —
sometimes the customer doesn't know which slip) and always references the
`Customer` directly. `ReturnLine.condition`
(`GOOD | DAMAGED | EXPIRED | WRONG_ITEM`) drives both the stock effect and
the cost effect — see [`SPEC.md` Part 4](../SPEC.md#part-4--returns-and-compensation).
`originalUnitCost` is copied from the source `IssueLine.unitCost` so restored
stock re-enters at the cost it left at, keeping the item's average stable
(re-entering at *today's* average would let a return silently shift cost
history).

## Payment / PaymentAllocation

`Payment` is the money received; `PaymentAllocation` is which `Issue`(s) it
was applied to, produced by `allocatePayment` (oldest-first — see
[02-costing-engine.md](./02-costing-engine.md)). Kept as separate tables
(rather than a single row) because one payment routinely clears several
invoices, and one invoice can be cleared across several payments.
`isReversed`/`reverseReason` support "wrong customer" / "cheque bounced"
without ever deleting the original payment row.

## CustomerLedger

The actual accounting ledger — append-only, `debit`/`credit`/`balanceAfter`
per row, one row per `Issue`/`ReturnNote`/`Payment`/adjustment. See
[ADR-004](./06-decisions.md#adr-004-prismas-generic-reftyperefid-kept-but-typed-fks-added-alongside-on-customer_ledger)
for why it carries both a generic `refType`/`refId` pair and typed optional
FKs to `Issue`/`ReturnNote`/`Payment`. `Customer.currentBalance` must always
equal the latest row's `balanceAfter` for that customer — verified nightly.

## PurchaseOrder / PurchaseOrderLine

Draft → Sent → Partial/Received → (or Cancelled). `estimatedUnitCost` vs.
`actualUnitCost` on the line is what feeds the price-variance warning at
receiving time.

## GoodsReceipt / GoodsReceiptLine

Where stock and cost actually enter the system (Phase 3). Each line converts
`qtyInPurchaseUnit` → `qtyInSellUnit` once, computes `unitCostSellUnit` (the
value that feeds `calculateMovingAverage`), and can create exactly one
`PurchaseLot` (`GoodsReceiptLine.purchaseLotId`, unique). `varianceFlagged` /
`priceVariancePercent` back the "cost rose >50%, confirm?" guard from
`SPEC.md` Part 10.

## Wastage

A loss, attributed to `WAREHOUSE | CUSTOMER_RETURN | SUPPLIER` so the P&L can
separate "we lost it" from "a customer's damaged return cost us" from "a
supplier shorted us." `costImpact` is `qty × unitCost` at the time of loss —
same freezing principle as everywhere else.

## StockAdjustment / StockCountSession / StockCountLine

A count session groups many item-level counts (`StockCountLine`); completing
it (with variances over a threshold requiring approval) generates
`StockAdjustment` rows, which are what actually move `item.currentStockQty`
(via a `StockMovement`, type `ADJUSTMENT`). The session itself never touches
stock directly.

## AuditLog

Append-only, `before`/`after` as `Json`. Every price change, cancellation,
credit-limit override, and manual adjustment writes here. **No delete
endpoint will ever exist for this table.**
