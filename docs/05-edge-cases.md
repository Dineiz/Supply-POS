# Edge cases

Every case below is specified in `SPEC.md` Part 10 (originally Part 8 of the
planning conversation). Status is tracked per case — **Handled** links to the
file/line that handles it; everything else is **Planned** (designed, not yet
built) until its phase lands. Add newly-discovered cases here as they turn
up; do not let this file go stale — see the vault's working rules in
[00-index.md](./00-index.md).

## Costing

| Case | Behaviour | Status |
|---|---|---|
| Receipt makes stock go from negative to positive | Do not blend the negative. Reset the average to the receipt cost. Log an anomaly. | **Handled** — [`packages/logic/src/costing.ts`](../packages/logic/src/costing.ts) `calculateMovingAverage`, wired into [`goods-receipts.ts`](../apps/api/src/routes/goods-receipts.ts). Not yet exercised with a real negative-stock scenario (would need an override issue first) — the underlying function is unit-tested for it, the receiving endpoint just hasn't been fed that specific case live |
| Stock is zero, a receipt arrives | Average becomes the receipt cost exactly. | **Handled and verified live** — first-ever receipt against an item with `avgCostPerUnit = 0` is never variance-flagged (guarded explicitly: `currentAvg.gt(0) &&  ...`), since there's no baseline to compare against |
| Receipt cost is 0 (free sample, promo) | Accept it. Average drops legitimately. Flag on the receipt as a zero-cost entry. | Blends correctly (pure function handles it); the "flag on receipt" display isn't built — a 0-cost line just looks like any other line today |
| Receipt cost >50% above current average | Amber warning at receiving, requires acknowledgement | **Handled and verified live in the browser** — see [07-progress.md](./07-progress.md#phase-3--receiving--goods-receipt-done-purchase-orders-not-started) for the exact scenario (Tomato 72.50 → 150, 107% flagged, blocked, then confirmed) |
| Item issued before any purchase exists | Blocked: "This item has no cost. Receive stock first." | Planned — Phase 4 |
| Negative stock from an override issue | Cost of goods uses the last known average. Flagged for next count. | Planned — Phase 4 (`calculateIssueCost` itself is agnostic to sign, already correct) |
| Two receipts of the same item in one transaction | Processed sequentially; average updates twice | Handled by construction — call `calculateMovingAverage` twice, feeding the second call the first call's output |

## Issues

| Case | Behaviour | Status |
|---|---|---|
| Customer over credit limit | ~~Amber at 80%, red block at 100% with manager PIN override, logged~~ | **Removed** — the credit-limit concept (field, blocking check, warnings, report flags) was removed entirely per request; a customer's balance is never capped |
| Item out of stock | Warning with manager override, never a hard block | **Handled** — same file, `shortItems` check, 409 without override, override resubmits successfully. Verified against Red Chilli Powder (seeded at 0 stock) |
| Issue cancelled after printing | Stock returns, ledger reversed with a credit entry, slip marked void, void notice prints | Planned — Phase 4 |
| Clerk issues to wrong customer | Cancel and reissue; both remain in the audit trail, no silent edit | Planned — Phase 4 |
| Two clerks issue the same last unit simultaneously | Atomic decrement at the DB level; loser sees negative-stock override prompt | Planned — Phase 4 (needs a DB-level atomic update, e.g. a conditional `UPDATE ... WHERE currentStockQty >= qty OR override`) |
| Price changed mid-order | Price captured when the line is added; a banner offers to update if the master price changes before submit | Planned — Phase 4 |
| Zero-value issue (sample/free goods) | Allowed with manager PIN + mandatory reason, always audited | Planned — Phase 4 |
| Issue printed, then printer jams | Reprint from the issue list; `printCount` increments; slip marked REPRINT | **Handled and verified** — a "Deliveries" page (`/issues`, [apps/web/app/(dashboard)/issues/page.tsx](<../apps/web/app/(dashboard)/issues/page.tsx>)) lists every issue with a "Print" link per row; opening it increments `printCount` again and shows `*** REPRINT — COPY n ***`. Verified: printed the same issue twice, second view correctly showed "COPY 2" |

## Returns

| Case | Behaviour | Status |
|---|---|---|
| Return without knowing the original slip | Allowed, `originalIssueId` null, credit at current price, flagged for review | **Handled and verified** — [`apps/api/src/routes/returns.ts`](../apps/api/src/routes/returns.ts); falls back to `item.baseSellPrice`/`avgCostPerUnit`. Tested: returned 1kg Salt with no issue reference, credited at the base price (45) correctly |
| Return qty exceeds issued qty | Blocked when linked to a slip; allowed unlinked with manager PIN | **Partially handled** — blocked when linked (`409`, verified against `issueLine.qty - issueLine.returnedQty`). The "allowed unlinked with manager PIN" half isn't built — an unlinked return currently has no qty ceiling at all, since there's nothing to check it against |
| Perishable returned outside the window | Condition forced to `DAMAGED`; credit still issued; warehouse absorbs the cost | **Handled and verified live** — see [07-progress.md](./07-progress.md#phase-6--returns-and-payments--done) for the exact backdated-issue test. The clerk's requested condition is silently overridden server-side; the credit still goes through; a `Wastage` row absorbs the cost |
| Returned item since renamed/deleted | Uses the denormalised name frozen on the `IssueLine` | Handled by schema design — see [03-schema.md](./03-schema.md#issueline) |
| Return against a fully paid invoice | Creates a credit balance, applied automatically to the next issue | Schema/math supports a negative `Customer.currentBalance` fine, but nothing yet **applies** a credit balance automatically to a *new* issue — an issue's `balanceAfter` is just `balanceBefore + totalAmount` regardless of sign. Not separately tested |
| Return creates a negative balance (overpaid) | Shown as a green "Credit: PKR x" on the account, auto-applied next time | Not built — no UI currently distinguishes a negative balance visually as a "credit" |
| Customer wants cash back on a full return | Refund payment entry with a negative amount, manager PIN, refund receipt | Not built |
| What cost does restored stock re-enter at? | The average cost at the time of the *original issue* (frozen on the `IssueLine`), not today's average | **Handled and verified** — `ReturnLine.originalUnitCost` copies `IssueLine.unitCost`, fed into `calculateMovingAverage` as if it were a receipt at that historical cost. See [03-schema.md](./03-schema.md#returnnote--returnline) |

## Payments

| Case | Behaviour | Status |
|---|---|---|
| Payment exceeds outstanding balance | Allowed, creates a credit balance | **Handled** — [`packages/logic/src/payments.ts`](../packages/logic/src/payments.ts) `allocatePayment` returns `unallocatedAmount` rather than erroring or discarding it; wired into `POST /payments`, which accepts it (the ledger description notes "includes advance/credit") |
| Payment recorded on the wrong customer | Reverse (new reversing ledger entry) then record correctly; both visible | **Handled and verified** — `POST /payments/:id/reverse` (same mechanism serves both "wrong customer" and "bounced cheque" — the difference is just the `reason` text). Both the original and the reversal remain visible in `CustomerLedger` |
| Cheque bounces | Reversal with reason `BOUNCED`, balance restored, customer flagged | **Handled and verified**, except "customer flagged" — reversal works exactly as specified and balance restoration was checked to the rupee, but there's no separate flag/indicator marking a customer as having had a bounced cheque before. `reverseReason` is free text (e.g. "Cheque bounced"), not a fixed `BOUNCED` enum value like the spec's own field name suggested — a real refinement, not a blocker |
| Partial payment against multiple invoices | Oldest-first, with manual override available | **Handled** (oldest-first, verified against 5+ real invoices at once). Manual override exists at the API level (`allocations` array) but has no UI — "hidden behind an Advanced toggle" per the spec's own framing, so this matches intent even though the toggle itself isn't built |
| Payment date backdated | Allowed within the current financial period; beyond that needs manager PIN | **Handled and verified live in the browser** — `Warehouse.periodLockedBefore` (nullable, set at `/settings`); `POST /payments` blocks (`409`) a `paymentDate` before it without a `POST /auth/authorize-override` approval. Verified: set the lock to a future date, a "today"-dated payment was blocked with the exact message, approved via owner PIN, and resubmitted successfully with the reason recorded on `Payment.notes` |
| Mixed cash + transfer for one delivery | Two `Payment` rows, same date | Supported by construction — nothing stops recording two separate payments same-day; not specifically re-tested since it needs no special-case code |

## Stock and wastage

| Case | Behaviour | Status |
|---|---|---|
| Physical count differs from system | Adjustment with mandatory reason; variance value calculated; approval required above a threshold | **Handled and verified live** — [`apps/api/src/routes/stock-counts.ts`](../apps/api/src/routes/stock-counts.ts) `POST .../complete` sums `|varianceValue|` across every changed line and blocks (`409`) above `warehouse.countVarianceApprovalThreshold` (default 5000) without a manager override. Verified: a spot count with a 194,000 variance was blocked, then completed after an owner-PIN override; a smaller 96-variance count completed directly with no override needed. Every variance line gets its own `StockAdjustment` row (the "mandatory reason" is the count itself: `reason: "Stock count {countNumber}"`) |
| Wastage exceeds current stock | Allowed to zero; discrepancy logged as an anomaly | **Handled and verified** — [`apps/api/src/routes/wastage.ts`](../apps/api/src/routes/wastage.ts) clamps `actualQty = min(requestedQty, max(currentStock, 0))` and records the shortfall in `notes` as `"...clamped to zero. Anomaly."` rather than letting stock go negative or silently recording the requested (wrong) qty |
| Wastage cost impact above a threshold | Requires manager/owner approval, same pattern as the credit/stock/variance overrides elsewhere | **Handled and verified live in the browser** — `costImpact > warehouse.wastageApprovalThreshold` (default 2000) blocks with `409` until a `POST /auth/authorize-override` approval is attached. Verified: 5kg of Black Pepper (10,000 impact) was blocked, then saved after an owner-PIN override; 3L of Milk (495 impact, under threshold) saved directly |
| Expired stock still shows as available | Daily job flags past-expiry items; counter tile shows a warning; wastage entry suggested | **Job half done and verified, counter tile not built** — [`apps/api/src/routes/reports.ts`](../apps/api/src/routes/reports.ts) `GET /reports/expiry` flags any perishable item with stock on hand whose oldest lot is past its expiry date, with a "Log wastage" link. Verified with a real backdated-expiry batch. No scheduler runs this automatically (see [06-decisions.md](./06-decisions.md) — no job queue in this stack); it's meant to be polled from an external cron once deployed, same as the reconciliation check. The counter-screen warning tile itself is still not built |
| Same item in multiple racks/lots | One stock number; lots guide picking order only | **Handled by schema design** — `Item.currentStockQty` is singular; `PurchaseLot` rows are for picking guidance only |
| Stock transferred between warehouses | `TRANSFER_OUT`/`TRANSFER_IN` pairs, cost travels with the goods | Schema supports it (`StockMovementType` includes both); flow itself is future work, no phase assigned |

## Operational

| Case | Behaviour | Status |
|---|---|---|
| Internet drops mid-order | Order built in memory; single POST retries on reconnect with an idempotency key | Planned — Phase 4 |
| Internet down at print time | Print happens locally from the client; server sync retries | Planned — Phase 5 |
| Two devices, same warehouse | Both work; atomic stock decrement; poll (not push) refreshes the other device | Planned — Phase 4 (no Socket.IO — see [ADR](./06-decisions.md), polling is the deliberate choice) |
| Clerk closes browser mid-order | Draft persisted to local storage on every change, restored on return | Planned — Phase 4 |
| Duplicate submit (double-tap Issue) | Idempotency key on the request; second submit returns the first result | **Handled** — [`apps/api/src/routes/issues.ts`](../apps/api/src/routes/issues.ts), `Issue.idempotencyKey` unique constraint. Verified both a same-process resubmit (returns original, stock not double-decremented) and the concurrent-race case (P2002 caught, loser re-fetches and returns the winner's row) |
| Month-end closing | Optional period lock; no backdated entries without owner PIN once locked | **Handled and verified** — see "Payment date backdated" above (Payments section) for the exact mechanism and test; set at `/settings`, `OWNER` only |
