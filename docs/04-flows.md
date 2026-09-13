# Flows

Design-level walkthroughs of the core transactions, from `SPEC.md` Parts
3–5 and 8. Issue, Return, Payment, Goods receipt, Wastage, and Stock count
are all implemented and verified (see each section for the file and the
exact scenario run) — only Purchase Orders remain unbuilt. Update each
section's file/line reference if the implementation moves, and cross-link
into [09-testing.md](./09-testing.md) for how each was verified.

## Issue (Phase 4) — **implemented**

[`apps/api/src/routes/issues.ts`](../apps/api/src/routes/issues.ts). Verified
end-to-end via the actual counter screen UI and directly against the API —
see [07-progress.md](./07-progress.md#phase-4--the-counter-screen--done-verified-in-browser)
for the exact scenario run. One database transaction:

1. Validate customer is active, items exist and are active, stock check
   (block if any line's qty exceeds `currentStockQty` unless a manager PIN
   override is supplied — log the override either way). There is no
   credit-limit check — that concept was removed entirely (see
   [03-schema.md](./03-schema.md#customer) and
   [07-progress.md](./07-progress.md)).
2. Create `Issue` + `IssueLine`s, freezing `itemName`, `unitCode`,
   `unitPrice`, `unitCost` (= current `item.avgCostPerUnit`) onto each line.
3. Decrement `item.currentStockQty` per line, atomically.
4. Write one `StockMovement` (`type: ISSUE`) per line.
5. Create a `CustomerLedger` row (`entryType: ISSUE`, debit = total).
6. Update `Customer.currentBalance`.
7. If paid at issue time, also create the `Payment` + `PaymentAllocation`(s)
   + a `CustomerLedger` credit row, in the same transaction.
8. Write an `AuditLog` row.

Idempotency: the endpoint accepts an `x-idempotency-key` header; a duplicate
submit (double-tap) returns the original result instead of creating a second
issue.

## Return (Phase 6) — **implemented**

[`apps/api/src/routes/returns.ts`](../apps/api/src/routes/returns.ts). Created
via a modal on the counter screen (any role), reviewed at `/returns`
(OWNER/MANAGER). Verified end-to-end, including the perishable-window
force — see
[07-progress.md](./07-progress.md#phase-6--returns-and-payments--done).

1. Create `ReturnNote` + `ReturnLine`s. Each line's `condition` defaults to
   `GOOD`; **forced to `DAMAGED` server-side** (the client's requested
   condition is never trusted for this) if the item is perishable and the
   return is outside `returnWindowHours` (credit still issued; cost becomes
   a `Wastage` row attributed to `CUSTOMER_RETURN`).
2. `GOOD`/`WRONG_ITEM` lines: restore stock by feeding
   `calculateMovingAverage` the line's `originalUnitCost` (from the source
   `IssueLine`, not today's average) as if it were a receipt at that
   historical cost — write a `StockMovement` (`RETURN_IN`).
3. `DAMAGED`/`EXPIRED` lines: no stock restoration, no `StockMovement` for
   the item (it was already out of stock since the original issue); create
   a `Wastage` row instead.
4. Update `IssueLine.returnedQty` on the source line when linked (blocks
   over-return: qty capped at `issueLine.qty - issueLine.returnedQty`, `409`
   if exceeded).
5. `CustomerLedger` credit row for the full `creditAmount` (valued at the
   original *selling* price the line was issued at, not cost — or
   `item.baseSellPrice` when the return isn't linked to a specific issue
   line).
6. Update `Customer.currentBalance`.
7. `AuditLog` row.

## Payment (Phase 6) — **implemented**

[`apps/api/src/routes/payments.ts`](../apps/api/src/routes/payments.ts) +
[`apps/api/src/lib/ledger.ts`](../apps/api/src/lib/ledger.ts) (the shared
outstanding-issues query, also used by `GET /customers/:id/outstanding-issues`).
Created via a modal on the counter screen, reviewed at `/payments`.

1. `getOutstandingIssues` computes each `ISSUED` issue's real remaining
   balance (`totalAmount` minus the sum of non-reversed
   `PaymentAllocation`s), oldest first.
2. `allocatePayment(amount, outstandingIssues)` → oldest-first allocation
   (see [02-costing-engine.md](./02-costing-engine.md)) — or, if the caller
   passes a manual `allocations` array, that's validated against each
   invoice's real balance instead.
3. Create `Payment` + one `PaymentAllocation` per invoice touched.
4. `CustomerLedger` credit row.
5. Update `Customer.currentBalance`.
6. Reversal (`POST /payments/:id/reverse`, wrong customer / bounced cheque)
   is a **new** reversing `CustomerLedger` entry plus
   `Payment.isReversed = true` — never an edit or delete of the original
   row; the customer's balance goes back up by the payment amount, and its
   allocations stop counting toward "paid" on the affected issues.

## Goods receipt (Phase 3) — **implemented** (direct receipt; PO-linked receiving not built)

[`apps/api/src/routes/goods-receipts.ts`](../apps/api/src/routes/goods-receipts.ts).
Verified end-to-end via the browser form and independently via the API —
see [07-progress.md](./07-progress.md#phase-3--receiving--goods-receipt-done-purchase-orders-not-started).
One transaction:

1. Convert each line's entered purchase-unit qty/cost to sell-unit terms
   (`qtyInSellUnit = qtyInPurchaseUnit * purchaseToSellFactor`,
   `unitCostSellUnit = unitCostPurchaseUnit / purchaseToSellFactor`).
2. Compute variance: `(unitCostSellUnit - item.avgCostPerUnit) / item.avgCostPerUnit`.
   If any line exceeds 50% and the request didn't set `acknowledgeVariance`,
   the whole receipt is rejected with `409` and the flagged lines listed —
   nothing is written until the caller resubmits with acknowledgement.
3. `calculateMovingAverage(item.currentStockQty, item.avgCostPerUnit,
   qtyInSellUnit, unitCostSellUnit)` → new `item.avgCostPerUnit`.
4. Increase `item.currentStockQty` by `qtyInSellUnit` (always additive,
   regardless of whether step 3 blended or reset the average).
5. Create a `PurchaseLot` (expiry, batch, supplier — for picking guidance and
   traceability, not costing) and a `GoodsReceiptLine` pointing at it.
6. `StockMovement` (`PURCHASE_RECEIVED`) with `avgCostBefore`/`avgCostAfter`;
   if the line was variance-flagged, `reason` records the acknowledged
   variance percentage.
7. `AuditLog` row.

Not implemented: linking a receipt to a `PurchaseOrder` (the field exists on
both `GoodsReceipt` and `PurchaseLot`, but nothing writes to
`PurchaseOrderLine.receivedQty` or transitions `PurchaseOrder.status` since
there's no PO creation UI yet — see progress doc).

## Wastage (Phase 7) — **implemented**

[`apps/api/src/routes/wastage.ts`](../apps/api/src/routes/wastage.ts). Created
from its own dashboard screen (`OWNER`/`MANAGER`), unlike Issue/Return/Payment
which are counter-screen actions — logging a loss is back-office bookkeeping,
not a sale. One transaction:

1. Clamp `actualQty = min(requestedQty, max(item.currentStockQty, 0))` — never
   let a loss push stock negative; if the request asked for more than was on
   hand, note the clamp as an anomaly rather than silently under-recording it.
2. `costImpact = actualQty × item.avgCostPerUnit`.
3. **Without** a manager override: `409` with the computed `costImpact` and
   the warehouse's threshold if `costImpact` exceeds
   `warehouse.wastageApprovalThreshold` — nothing written yet. **With** one:
   proceed regardless, recording who approved it.
4. Create the `Wastage` row (`attributedTo: WAREHOUSE` — distinct from the
   `CUSTOMER_RETURN`-attributed `Wastage` rows the Return flow above already
   writes for damaged/expired returns).
5. Decrement `item.currentStockQty`; the average cost itself does **not**
   change — a loss doesn't change what the remaining stock is worth, only how
   much of it there is.
6. `StockMovement` (`WASTAGE`).
7. `AuditLog` row.

## Stock count (Phase 7) — **implemented**

[`apps/api/src/routes/stock-counts.ts`](../apps/api/src/routes/stock-counts.ts).
A session-based flow (unlike every other transaction in this doc, which
completes in a single request): start a session, adjust lines over however
long the physical count takes, complete it once.

1. **Start** (`POST /stock-counts`): snapshot `systemQty` from
   `item.currentStockQty` onto one `StockCountLine` per item in scope (`FULL`,
   one `PARTIAL` category, or a hand-picked `SPOT` list), `countedQty`
   initialized equal to `systemQty`.
2. **Count** (`PATCH .../lines/:lineId`, called once per line, as many times
   as the counter needs to correct a number): recompute
   `variance = countedQty - systemQty` and `varianceValue = variance ×
   item.avgCostPerUnit` against the line's frozen `systemQty` — never against
   whatever the item's live stock happens to be at PATCH time, so counting
   several items over an hour doesn't let one line's completion affect
   another's variance math.
3. **Complete** (`POST .../complete`): sum `|varianceValue|` across every
   variance line. **Without** a manager override: `409` (with the total and
   the threshold) if that sum exceeds `warehouse.countVarianceApprovalThreshold`
   — nothing written yet. **With** one: proceed regardless. Then, in one
   transaction, for each variance line: create a `StockAdjustment` (the
   count's own audit trail, separate from `StockMovement`), set
   `item.currentStockQty = countedQty` directly (a count is a resync to
   ground truth, not a delta), write a `StockMovement` (`ADJUSTMENT`). Mark
   the session `COMPLETED` with rollup totals. `AuditLog` row.
4. **Cancel** (`POST .../cancel`, only from `IN_PROGRESS`): discards the
   session with no effect on stock — for when a count is abandoned partway
   through.

Both `PATCH` and `complete` reject (`409`) once a session has left
`IN_PROGRESS`, so a completed or cancelled count can never be edited after
the fact — the same append-only spirit as every ledger in this system, just
enforced by a status check instead of "insert-only, never update."
