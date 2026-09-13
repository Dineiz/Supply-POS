# Progress

## Phase 1 — Foundation — **done**

Repo structure, vault, full Prisma schema (26 models, migrated to a real
local Postgres), `packages/logic` (9 pure functions, 34 passing tests),
`tsc --noEmit` clean across all 4 packages.

## Phase 2 — Master data — **partially done**

| Task | Status |
|---|---|
| Auth: email+password (OWNER/MANAGER), PIN (CLERK) | **Done** — `POST /auth/login`, bcrypt, JWT (12h) |
| Manager/owner override authorization (PIN or password) | **Done** — `POST /auth/authorize-override`, writes an `AuditLog` row |
| `warehouseId` scoping middleware | **Done** — every query filters by `request.user.warehouseId` from the JWT, never the body |
| Rate limiting on login | **Done** — 10/min on `/auth/login`, 100/min elsewhere |
| Items CRUD | **Done** — list ([apps/web/app/(dashboard)/items/page.tsx](<../apps/web/app/(dashboard)/items/page.tsx>)), create/edit form ([apps/web/components/items/item-form.tsx](../apps/web/components/items/item-form.tsx)), `GET/POST/PATCH/DELETE /items`. Verified in-browser: created an item, edited Sugar's price (160→165, margin recalculated to 12.4% correctly, reverted), soft-deleted a test item |
| Customers CRUD | **Done** — same pattern, [apps/web/app/(dashboard)/customers/page.tsx](<../apps/web/app/(dashboard)/customers/page.tsx>) + [customer-form.tsx](../apps/web/components/customers/customer-form.tsx). Verified in-browser: created "New Town Diner" with a 15,000 credit limit, appeared correctly in the list, deactivated it afterward |
| Opening stock / opening balance on create | **Done, later fixed** — see the opening-stock unit-conversion bug below; `POST /customers` with `openingBalance` writes an `OPENING_BALANCE` `CustomerLedger` row, verified against Postgres directly |
| Units can't be changed after an item exists | **Deliberate, done** — `purchaseUnitId`/`sellUnitId`/`purchaseToSellFactor` are edit-disabled in the UI and excluded from the `PATCH /items/:id` payload entirely (changing them would silently reinterpret existing stock quantity). To fix a wrong unit: deactivate and recreate |
| Role gating | **Done** — `requireRole("OWNER","MANAGER")` guards every write endpoint (verified: clerk token gets 403 creating an item); the dashboard layout redirects CLERK/VIEWER to `/counter` on mount |
| Hard delete vs. deactivate | Only "Deactivate/Reactivate" (`isActive` toggle) is exposed in the UI — reversible, shows up under "Show inactive". The harder `DELETE` (which also sets `isDeleted`, hiding it even from "Show inactive") exists and is tested at the API level but has no UI button yet, matching the spec's own instinct that deletion should be a separate, more deliberate action (Part 12: "Deleting an item: type the name to confirm") |
| CRUD for units, categories, suppliers | **Done** — full CRUD under a new `/setup` hub ([apps/web/app/(dashboard)/setup/page.tsx](<../apps/web/app/(dashboard)/setup/page.tsx>), `units`/`categories`/`suppliers` subpages), `OWNER`/`MANAGER` for the mutating verbs. Deleting a unit or category is blocked (`409`) while any item still references it ("Reassign them first"); deleting a supplier soft-deactivates rather than removing the row, since historical `GoodsReceipt`s must keep resolving a name |

## Phase 3 — Receiving — **goods receipt done, purchase orders not started**

| Task | Status |
|---|---|
| Goods receipt (direct, no PO) | **Done** — `POST /goods-receipts` ([apps/api/src/routes/goods-receipts.ts](../apps/api/src/routes/goods-receipts.ts)), form at [apps/web/app/(dashboard)/receiving/new/page.tsx](<../apps/web/app/(dashboard)/receiving/new/page.tsx>), history at [.../receiving/page.tsx](<../apps/web/app/(dashboard)/receiving/page.tsx>). One transaction per receipt: `PurchaseLot` + `GoodsReceiptLine` + `StockMovement` (`PURCHASE_RECEIVED`, before/after qty and avg cost) per line, `Item.currentStockQty`/`avgCostPerUnit` updated via the same `calculateMovingAverage` used everywhere else, `AuditLog` row |
| Cost variance warning (>50% above current average) | **Done and verified live in the browser** — as the clerk types a cost, the form shows `⚠ N% above the current average cost` immediately (client-side calc mirroring the server's). Submitting with a flagged line returns `409` with `flaggedLines`; the UI shows a confirmation modal ("Confirm price increase") and resubmits with `acknowledgeVariance: true`. Tested end-to-end: received 10kg Tomato @ 150 against a 72.50 average (107% over) — blocked, confirmed via the modal, then succeeded and recalculated the average to 127.86 correctly |
| Purchase-unit → sell-unit conversion on receipt | **Done** — the form asks for qty and cost *in the purchase unit* (matching what a real supplier invoice shows, e.g. "1 bag, Rs 7,600"), converts to sell-unit terms for costing (`unitCostSellUnit = unitCostPurchaseUnit / purchaseToSellFactor`), and shows a live "= 50 kg @ PKR 152/kg" preview before submitting |
| Negative/zero stock reset on receipt | **Handled by construction** — reuses the same `calculateMovingAverage` from `packages/logic` that's already unit-tested for this case; no separate logic to verify |
| Expiry/batch capture | **Done** — the form shows an expiry date field only when the selected item `isPerishable`; batch number is free-text for any item, stored on `PurchaseLot` |
| Purchase orders (draft/send/receive-against-PO) | **Not started** — schema exists (`PurchaseOrder`, `PurchaseOrderLine`) and `GoodsReceipt`/`PurchaseLot` both carry an optional `purchaseOrderId`, but there's no UI to create a PO or receive against one. Every receipt today is a direct/ad-hoc receipt, which matches how a small trading business actually buys day-to-day more than formal PO paperwork does — revisit if the client actually uses POs |
| Role gating | **Done** — receiving lives under the same `(dashboard)` shell as Items/Customers, `OWNER`/`MANAGER` only. (Open question, not yet resolved: a real warehouse might want the clerk to log physical receipt of a delivery truck too — see `SPEC.md` Part 0. Easy to revisit: move the route out of the role-gated shell and gate only the variance-override step if the client wants that.) |

### Exact scenario verified (matches `SPEC.md` Part 1's own worked example)

Ran through the API directly, then reproduced independently through the actual browser form:
```
Sugar started at 70kg @ 144.50 avg (from earlier issue-flow testing)
Receive 1 bag (50kg) @ 7,600/bag = 152/kg -> avg becomes 147.625, stock 120kg
Receive 1 bag (50kg) @ 12,500/bag = 250/kg -> 69.3% variance, blocked without
  acknowledgement, succeeds with it -> avg becomes 177.7353, stock 170kg
```
Both numbers were independently recomputed by hand against the weighted-average formula and matched the API's response exactly. These two receipts (`GRN-2609-0001`, `GRN-2609-0002`) and a third from the in-browser test (`GRN-2609-0003`) are left in the dev database rather than reverted — deleting them would mean deleting real `StockMovement`/`PurchaseLot` rows, which the whole system is built to never do. Sugar's and Tomato's average costs in the seed data now reflect these test receipts, not the original seed numbers, which is expected and correct, not corruption.

## Phase 4 — The counter screen — **done, verified in-browser**

- Full catalogue loads once via `GET /items` + `GET /customers` into a
  Zustand store (`apps/web/lib/store.ts`); every tap after that reads from
  memory. [apps/web/app/counter/page.tsx](../apps/web/app/counter/page.tsx)
- Tap-to-add, qty stepper, category filter, search — all working, tested
  manually in the browser (typed "sugar", tapped it 3 times, confirmed
  `3 kg × PKR 160 = PKR 480` on the cart line).
- Customer picker with balance/credit-utilization display.
- `POST /issues` is a single request per issue, wrapped in one Prisma
  transaction: creates the `Issue` + `IssueLine`s (name/unit/price/cost
  frozen), decrements `Item.currentStockQty`, writes a `StockMovement`,
  writes a `CustomerLedger` debit row, updates `Customer.currentBalance`,
  and (if paid) creates a `Payment` + `PaymentAllocation` + a ledger credit
  row — all in the same transaction.
- **Idempotency key verified**: resubmitting the same `x-idempotency-key`
  returns the original issue and does not double-decrement stock (tested
  directly against the API).
- **Credit-limit block verified** (later removed — see below): at the time,
  an order that would exceed `Customer.creditLimit` returned `409` with
  `overCredit: true`; the "Get manager override" button called
  `/auth/authorize-override` and, once approved, resubmitted with the
  override attached.
- **Out-of-stock block verified**: issuing more than `Item.currentStockQty`
  returns `409` with the short items listed, same override path.
- Not yet built: printing (Phase 5 — the "Issue" button does not print
  anything yet, intentionally not labelled "Issue & Print" until it does),
  held orders, barcode-scan-to-add, local-storage draft persistence.

### End-to-end scenario actually run (not hypothetical)

Logged in as clerk "Ahmed Khan" via PIN in the browser, selected Al-Madina
Restaurant, added 3kg Sugar (Refined) by tapping the tile three times,
clicked Issue. Result, confirmed in the UI and cross-checked in Postgres:

```
Issued ISS-2609-0003
Sugar stock: 74kg -> 71kg
Customer balance: 3,860 -> 4,340  (+480 = 3kg x 160)
StockMovement row: ISSUE, qty -3, qtyBefore 74, qtyAfter 71
CustomerLedger row: ISSUE, debit 480, balanceAfter 4,340
```

## Phase 5 — Printing — **done**

| Task | Status |
|---|---|
| Delivery Note | **Done and verified** — [components/print/delivery-note.tsx](../apps/web/components/print/delivery-note.tsx). Every element from `SPEC.md` Part 6's mockup is there: header (name/address/phone/NTN), date/time/customer/code/contact/issued-by/received signature line, item table (name on its own line, right-aligned qty/rate/amount), items/qty count, subtotal/discount/TOTAL, the visually-dominant ACCOUNT SUMMARY block (previous balance / this delivery / paid now / BALANCE DUE), credit limit + available (only shown when a limit is set), the "oldest unpaid" collection nudge, returns policy text, two signature lines, "Powered by Dineiz" footer |
| Picking Slip | **Done and verified** — [components/print/picking-slip.tsx](../apps/web/components/print/picking-slip.tsx). No prices, large bold qty, checkbox per line, rack location (see below), perishable expiry guidance, Picked by / Checked by lines |
| Rack location | **Added** — `Item.location` (new nullable column, wasn't in the schema before this phase), settable in the item form ("Rack / location", under Stock rules), printed on the picking slip when set. Verified: set Sugar's location to "Rack A-2", it appeared on the printed slip |
| Perishable picking guidance | **Done, with a known simplification** — shows the oldest `PurchaseLot` (by `receivedAt`) with `remainingQty > 0` for each perishable line item, printed as "⚠ Issue oldest crate first / Received DD Mon YYYY". **Limitation, stated plainly**: `PurchaseLot.remainingQty` is set at receiving time but nothing decrements it as stock is issued (issues use weighted-average costing, not FIFO lot consumption) — so this guidance points to the oldest lot *ever received* that hasn't been fully zeroed out by returns/wastage bookkeeping, not a precisely-tracked "here's exactly what's left in that crate." Good enough to point a picker at older stock first; not a real FIFO inventory system |
| 80mm thermal print CSS | **Done** — `@page { size: 80mm auto; margin: 0 }` in `apps/web/app/globals.css`, a `.receipt` class (72mm content width, monospace, tight line-height) shared by both documents, a bordered/shadowed on-screen preview that becomes borderless at actual print size. Verified visually at full detail via direct navigation to the print page — every section renders exactly as designed, real data throughout |
| Reprint marking | **Done and verified** — `POST /issues/:id/print` increments `Issue.printCount` on every print (including the first); the Delivery Note shows `*** REPRINT — COPY n ***` above the header once `printCount > 1`. Verified by loading the same print page twice: first view showed no banner (count 1), second showed "COPY 2" |
| Trigger from the counter screen | **Done** — the button is now labelled "Issue & Print" (it wasn't, deliberately, until this phase). On success it calls `window.open('/print/issue/{id}', '_blank')`; if the popup is blocked, a "Pop-up blocked — tap to print" link appears in the success banner as a manual fallback, and a "Print again" link is always available there too. Verified the full chain from a real button click: issue created, print page loaded in response to the click, `printCount` incremented, and `window.print()` actually invoked a real native print dialog (confirmed indirectly — the automated browser became unresponsive to screenshots/page-reads in exactly the way a modal OS print dialog would cause, and closing that tab and re-querying the API confirmed the issue and its incremented print count were both correctly persisted) |
| A real bug found and fixed along the way | `apps/web/lib/api.ts`'s `apiFetch` always sent `Content-Type: application/json`, even for body-less requests — Fastify correctly rejects that combination (`400`). The only call shaped that way was the print-count increment (`POST` with no body). Fixed at the root: the header is now only added when a `body` is actually present, which protects every future body-less call too, not just this one |
| Return Note / Payment Receipt / Customer Statement / Goods Receipt Note / Purchase Order / Daily Summary printing | **Not built** — `SPEC.md` Part 7 lists these; only the Issue's two documents were in scope for this pass. The same pattern (a `GET .../print-data` endpoint + a `.receipt`-styled component) would extend to each in a follow-up |
| Finding an old issue to reprint | **Done** — added a "Deliveries" page (`/issues`, [apps/web/app/(dashboard)/issues/page.tsx](<../apps/web/app/(dashboard)/issues/page.tsx>)) with a "Print" link per row, since without it the only way back to a print URL was the counter screen's own just-issued banner. Small, deliberate scope addition beyond the original ask, to make the reprint feature actually usable days later |

## Phase 6 — Returns and payments — **done**

**Architectural call made here:** unlike Items/Customers/Receiving (which
are `OWNER`/`MANAGER`-only dashboard screens), returns and payments are
*created* from the **counter screen** — reachable by any logged-in role,
including CLERK — via two modals, matching `SPEC.md` Part 5's own mockup
which shows `[Payment]` as a button right next to `[ISSUE & PRINT]`. History
review (`/returns`, `/payments`) still lives in the `OWNER`/`MANAGER`
dashboard. This is a deliberate split: day-to-day counter activity vs.
back-office oversight.

| Task | Status |
|---|---|
| `POST /returns` | **Done** — [apps/api/src/routes/returns.ts](../apps/api/src/routes/returns.ts). One transaction: `ReturnLine` per item, stock + `avgCostPerUnit` restored via `calculateMovingAverage` (fed the *original* frozen cost, not today's average — same function used for goods receipt, just called with a historical cost) for GOOD/WRONG_ITEM lines; a `Wastage` row (`attributedTo: CUSTOMER_RETURN`) for DAMAGED/EXPIRED lines instead, with no stock movement (the goods were already out of stock when issued — a damaged return doesn't re-decrement anything); `IssueLine.returnedQty` updated when linked; `CustomerLedger` credit row at the *selling* price, not cost; `Customer.currentBalance` updated; `AuditLog` row |
| Return UI | **Done** — [components/counter/return-modal.tsx](../apps/web/components/counter/return-modal.tsx), launched from the counter screen's "Return" button. Picking a recent issue pre-fills its returnable lines (qty defaults to 0, clerk bumps up what's actually coming back) with the price locked to what was originally charged; "No slip / not sure" starts one blank ad-hoc line instead (item picked manually, price editable, defaults to `baseSellPrice`) |
| Perishable return-window enforcement | **Done and verified** — forces `condition` to `DAMAGED` server-side (never trusts the client's requested condition) when `hoursSinceIssue > item.returnWindowHours`, regardless of what the UI sent. Verified by backdating a test issue's `issuedAt` by 20 hours (Tomato's window is 12h) and confirming a requested `GOOD` return came back as `DAMAGED`, `restoredToStock: false`, with a `Wastage` row written (`WST-2609-0001`, `attributedTo: CUSTOMER_RETURN`) — while the customer still got their full credit |
| Return cost/credit valuation | **Done and verified** — credit is `qty × price-at-time-of-issue` (not cost); cost reversal uses `IssueLine.unitCost` frozen at issue time (not today's possibly-drifted average). Verified: returned 2kg Sugar issued at 160/kg when the average was 177.7353 — credit was exactly 320 (2×160), cost reversed was exactly 355.47 (2×177.7353), and blending it back in left the average unchanged (167kg avg unaffected) because the return cost matched the then-current average exactly |
| Unlinked return (no slip) | **Done and verified** — `originalIssueId` omitted, `item.baseSellPrice`/`avgCostPerUnit` used as fallback pricing, both clearly less authoritative than a linked return but functional |
| `POST /payments` | **Done** — [apps/api/src/routes/payments.ts](../apps/api/src/routes/payments.ts). Default oldest-first via the same `allocatePayment` from `packages/logic` used nowhere else until now (queried live against real outstanding balances via a new shared helper, [apps/api/src/lib/ledger.ts](../apps/api/src/lib/ledger.ts)); an optional `allocations` array allows manual override (validated against each invoice's real remaining balance) — not exposed in the UI yet (auto-allocation only), but the endpoint supports it |
| Payment UI | **Done** — [components/counter/payment-modal.tsx](../apps/web/components/counter/payment-modal.tsx). Shows a live "this will clear: ISS-..., ISS-..." preview as the amount is typed, computed client-side with the same oldest-first logic (plain numbers, mirroring the receiving form's variance-preview pattern — the server call is what's authoritative) |
| Payment reversal | **Done and verified** — `POST /payments/:id/reverse` (`OWNER`/`MANAGER` only), a "Reverse" button on the `/payments` history page with a required reason. Writes a reversing `CustomerLedger` entry (never edits/deletes the original), sets `isReversed`/`reversedAt`/`reverseReason`, restores the customer's balance. A reversed payment's allocations stop counting as "paid" in the outstanding-issues query, so the underlying invoice becomes payable again. Verified: recorded a payment, balance dropped; reversed it with reason "Cheque bounced", balance restored exactly; a second reverse attempt correctly returned `409` |
| Manual payment allocation ("Advanced" toggle) | **Not built in the UI** — the endpoint supports it (see above), matching the spec's own framing of this as a rare, secondary path |
| Cash refund on a full return | **Not built** — `Payment` supports negative amounts in the schema but nothing creates one from a return flow yet |
| Customer statement / full ledger view | **Not built** — `GET /customers/:id/ledger` exists (returns the raw `CustomerLedger` rows) but there's no screen presenting it yet; more of a Phase 8 reporting concern |

### Exact scenario verified (matches `SPEC.md` Part 2's own worked example, as a delta on live data)

Rather than resetting the dev database to reproduce the spec's exact starting
numbers (which would mean deleting real transactions — not something this
system does to itself), the same *shape* of scenario was run as a delta on
top of whatever the customer's balance already was, and checked at each
step:

```
Issue 5kg Sugar @ 160, unpaid           -> balance +800
Return 2kg (GOOD, linked to that issue) -> balance -320 (credit at 160,
                                            not at the 177.7353 it cost)
Issue 3L Cooking Oil @ 360              -> balance +1,080
Pay 1,000 cash, oldest-first            -> cleared two full invoices and
                                            partially cleared a third,
                                            confirmed against
                                            GET /customers/:id/outstanding-issues
                                            before and after
```
Every balance-before/balance-after pair matched hand-computed arithmetic
exactly at every step, both via direct API calls and by reproducing the
payment step through the actual counter-screen Payment modal.

## Phase 7 — Wastage and stock counts — **done**

**Architectural call made here:** like Items/Customers/Receiving, Wastage and
Stock Counts are `OWNER`/`MANAGER`-only dashboard screens (the counter screen
stays untouched) — logging a loss or running a count is back-office activity,
not something a counter clerk does mid-sale. Both reuse the same
manager-override pattern already built for the counter screen's credit/stock
blocks and receiving's variance block: the `OverrideModal` component (moved
this phase from `components/counter/` to
[components/shared/override-modal.tsx](../apps/web/components/shared/override-modal.tsx)
so Wastage and Stock Counts could use it too, with a new optional
`description` prop for context-specific copy) plus the same
`POST /auth/authorize-override` endpoint. Two new `Warehouse` columns back the
thresholds: `wastageApprovalThreshold` (default 2000) and
`countVarianceApprovalThreshold` (default 5000).

| Task | Status |
|---|---|
| `POST /wastage` | **Done** — [apps/api/src/routes/wastage.ts](../apps/api/src/routes/wastage.ts). One transaction: clamps `actualQty = min(requestedQty, max(currentStock, 0))`, computes `costImpact = actualQty × avgCostPerUnit`, creates the `Wastage` row (`wastageNumber` `WST-YYMM-NNNN`, `attributedTo: WAREHOUSE`), decrements `item.currentStockQty`, writes a `StockMovement` (`WASTAGE`, average cost unchanged — a loss doesn't change what the remaining stock is worth), `AuditLog` row |
| Wastage exceeds current stock | **Handled and verified** — clamps to the actual stock on hand rather than going negative, and records the clamp as `"Requested X but only Y was in stock; clamped to zero. Anomaly."` in `notes` (and a matching note on the `StockMovement.reason`) so the discrepancy is visible without a special "anomaly" field |
| Wastage approval threshold | **Done and verified live in the browser** — a loss whose `costImpact` exceeds `warehouse.wastageApprovalThreshold` returns `409` with `{ costImpact, threshold }` and nothing is written; the form shows the exact server message plus a "Get manager override" link, and resubmits with the approval attached once authorized |
| Wastage UI | **Done** — history at [.../wastage/page.tsx](<../apps/web/app/(dashboard)/wastage/page.tsx>), form at [.../wastage/new/page.tsx](<../apps/web/app/(dashboard)/wastage/new/page.tsx>): item picker shows live stock-on-hand and average cost, qty/reason/notes, a live "Estimated cost impact" preview computed client-side the same way the server will compute it, and a clamp warning when the typed qty exceeds stock |
| `POST /stock-counts` (start a session) | **Done** — [apps/api/src/routes/stock-counts.ts](../apps/api/src/routes/stock-counts.ts). Three types: `FULL` (every active item), `PARTIAL` (one category), `SPOT` (a hand-picked item list). Snapshots `systemQty` (= `item.currentStockQty` at that instant) onto one `StockCountLine` per item, `countedQty` initialized equal to `systemQty` (zero variance until the counter changes it) |
| `PATCH /stock-counts/:id/lines/:lineId` | **Done** — recomputes `variance`/`varianceValue` from the submitted `countedQty` against the line's frozen `systemQty`; `409` if the session isn't `IN_PROGRESS` any more (can't edit a completed or cancelled count) |
| `POST /stock-counts/:id/complete` | **Done and verified live** — sums `|varianceValue|` across every line with a non-zero variance; if that total exceeds `warehouse.countVarianceApprovalThreshold`, `409`s with `{ totalVarianceValue, threshold }` and writes nothing. Otherwise, in one transaction: one `StockAdjustment` per variance line (`adjustmentNumber` `ADJ-YYMM-NNNN`, reason `"Stock count {countNumber}"`), `item.currentStockQty` set to `countedQty`, a `StockMovement` (`ADJUSTMENT`) per line, session marked `COMPLETED` with rollup totals, `AuditLog` row |
| `POST /stock-counts/:id/cancel` | **Done and verified** — only from `IN_PROGRESS`; sets `CANCELLED`, touches no stock. Verified a cancelled session can't afterward be patched or re-cancelled (`409` both ways) and left the item's stock untouched |
| Stock count UI | **Done** — history at [.../stock-counts/page.tsx](<../apps/web/app/(dashboard)/stock-counts/page.tsx>), start form at [.../stock-counts/new/page.tsx](<../apps/web/app/(dashboard)/stock-counts/new/page.tsx>) (type selector + category/item picker), active counting screen at [.../stock-counts/[id]/page.tsx](<../apps/web/app/(dashboard)/stock-counts/%5Bid%5D/page.tsx>) — per-line qty inputs with instant client-side variance/value (no round trip needed to see the number update), a running "N of M items have a variance" + total variance value, `PATCH` fired on blur, and every dirty line flushed before `complete` is called so a value typed and immediately submitted isn't lost to a race. A completed or cancelled session renders the same screen read-only (no inputs, no action buttons) |
| Actor-name denormalization | **Added this phase** — `StockAdjustment.performedByName`/`approvedByName`, `StockCountSession.startedByName`/`completedByName`/`approvedByName`, `StockCountLine.countedByName` — matching the pattern already used everywhere else (`Issue.issuedByName`, `Payment.receivedByName`, etc.) so history views never need to join back to `User` just to show who did something |
| A real bug found and fixed along the way | `apps/web/lib/api.ts`'s `apiFetch` unconditionally called `res.json()` on every non-error response — fine for every endpoint until now, but `POST /stock-counts/:id/cancel` returns a bare `204 No Content`, and `res.json()` on an empty body throws. No endpoint returning `204` had ever actually been called from the frontend before (the existing `DELETE /items/:id` and `DELETE /customers/:id` 204s have no UI button yet), so this had been a latent bug since Phase 2. Fixed at the root: `apiFetch` returns `undefined` immediately when `res.status === 204`, before attempting to parse a body |

### Exact scenarios verified (API directly, then reproduced live in the browser)

Wastage:
```
2kg Tomato (Fresh), reason SPOILED -> stock 9 -> 7, costImpact 255.71 (2 x 127.8571)
Requested more Tomato than was in stock -> clamped to what was on hand,
  Wastage.qty = the clamped amount, "Anomaly" noted, StockMovement matches the clamp exactly
5kg Black Pepper (avg cost 2,000/kg = 10,000 impact, threshold 2,000) -> 409,
  then POST /auth/authorize-override (owner PIN) -> resubmit with approval -> 201,
  WST-2609-0006 recorded "Approved by Faisal Sheikh"
3L Milk (Fresh), reason SPOILED, PKR 495 (3 x 165, under threshold) -> saved directly, no override needed
```

Stock counts:
```
Spot count, 2 items, 1 with variance -> ADJ-2609-0001: systemQty 150 -> countedQty 148,
  variance -2, varianceValue -64.00; Salt stock 150 -> 148; StockMovement (ADJUSTMENT) matches
Spot count, Black Pepper counted 100 vs system 3 (varianceValue 4,000, under the 5,000
  threshold) -> completed directly, no override needed, stock -> 100
Spot count, Black Pepper counted 0 vs system 95 (varianceValue 190,000, over threshold) -> 409,
  owner-PIN override -> auto-resubmits on approval (no second button click needed) -> completed,
  stock -> 0
Full count (all 10 active items) started, then cancelled from the counting screen's own
  "Cancel count" confirmation -> status CANCELLED, no item's stock touched
A cancelled/completed session's lines are read-only in the UI and reject PATCH server-side (409)
```

## Phase 8 — Reports — **superseded by Phase 10, kept as history**

> Every endpoint and route named below (`/reports/pnl`, `/reports/aging`,
> `/reports/stock-valuation`, etc.) was renamed, merged, or replaced in
> Phase 10. This section is left as-written for the record of what was built
> and what bugs were found then — for current endpoint names and behavior see
> [Phase 10](#phase-10--reports-rebuild-and-reports-hub--done) and
> [08-api.md](./08-api.md).

`SPEC.md` Part 9 lists sixteen reports across four categories. Building all
sixteen with equal depth would have meant either shipping several as thin,
unverified stubs, or spending the whole phase on reports of marginal value
(Purchasing: Price Trend/Supplier Comparison/Variance; Stock: Consumption)
instead of the ones the spec itself flags as most important. (Expiry landed
in Phase 9 instead — the same "daily job" framing as the reconciliation
check, so it made more sense grouped with that hardening work than here.)
The call made here: build the reports with a real formula or a real "so what"
for the owner, verify each one's numbers by hand against the dev database,
and document the rest as an honest gap rather than a shallow pass. Every
report below is `OWNER`/`MANAGER`-only, under a new `/reports` hub page
(one sidebar link, not eight).

`SPEC.md` Part 9 lists sixteen reports across four categories. Building all
sixteen with equal depth would have meant either shipping several as thin,
unverified stubs, or spending the whole phase on reports of marginal value
(Purchasing: Price Trend/Supplier Comparison/Variance; Stock: Consumption)
instead of the ones the spec itself flags as most important. (Expiry landed
in Phase 9 instead — the same "daily job" framing as the reconciliation
check, so it made more sense grouped with that hardening work than here.)
The call made here: build the reports with a real formula or a real "so what"
for the owner, verify each one's numbers by hand against the dev database,
and document the rest as an honest gap rather than a shallow pass. Every
report below is `OWNER`/`MANAGER`-only, under a new `/reports` hub page
(one sidebar link, not eight).

| Report | Status |
|---|---|
| Profit & Loss | **Done and verified** — [apps/api/src/routes/reports.ts](../apps/api/src/routes/reports.ts) `GET /reports/pnl`. Revenue/returns/COGS/wastage for a date range (default: this month). There is no overhead/expense tracking anywhere in this system (rent, salaries, etc.), so this is a trading gross-margin report, not a full P&L with operating expenses — the page says so explicitly rather than implying more than it is |
| Margin by Item | **Done and verified** — `GET /reports/margin-by-item`, worst-margin-first. Straight `IssueLine` group-by for the period |
| Margin Erosion | **Done and verified** — `GET /reports/margin-erosion`. Live state (not a period report): flags active items whose `(baseSellPrice - avgCostPerUnit) / baseSellPrice` is below their own `marginFloorPercent`, using the already-existing, already-tested `calculateMarginPercent`. Only items with a floor configured are checked, matching the spec's own wording ("below a *configurable* floor") — an item with no floor set has no threshold to fall below, by design, not by omission |
| Receivables Aging | **Done, and a real bug found and fixed** — the spec's own framing: "the single most useful report for the owner." First pass only walked `Issue` rows, which meant a customer whose balance came from an opening balance (no `Issue` row at all) was invisible to it — Bismillah Restaurant (PKR 5,400) and Karachi Grill (PKR 6,600) both silently missing, only Al-Madina (PKR 495, real issues) showing up. Rebuilt on a new pure function, [`ageLedgerDebits`](../packages/logic/src/aging.ts), that FIFO-consumes a customer's *whole* `CustomerLedger` history (any debit type, not just issues) against all their credits, oldest debit first — matching how this system already treats payments as a running account, not invoice-by-invoice settlement (`SPEC.md` Part 4/5). Buckets by **days past due** (each debit's own date + that customer's `creditDays`), not days since the debit — a charge still inside its own credit terms is current, not aging. Verified: all three customers now appear, bucket totals sum to exactly `12,495`, matching the sum of `customer.currentBalance` across the warehouse to the rupee; Karachi Grill's Jul-9 opening balance with 30-day terms correctly lands in the 31-60d bucket (36 days past due today) |
| Stock Valuation | **Done and verified** — `GET /reports/stock-valuation`, `currentStockQty × avgCostPerUnit` per item, grand total cross-checked by hand (93,498.06) |
| Reorder Suggestions | **Done, and a second real bug found and fixed** — the spec's exact formula: trailing 21-day average daily usage *excluding stockout days*, `daysOfCover = stock / avgDailyUsage`, suggest reordering (rounded up to a whole purchase unit) when under a new `Item.reorderDays` field (nullable — unset means "not tracked," never flagged). Two new pure functions: [`calculateAverageDailyUsage`](../packages/logic/src/reorder.ts) (new) alongside the already-existing `calculateDaysOfCover`/`suggestReorderQty` (built in Phase 1, never wired to anything until now). First pass marked a day "stockout" purely from the stock level at the *start* of that day — which incorrectly excluded a day that opened at zero but still saw real sales later (stock arrived, or it's the item's first day of existence), throwing away genuine usage data instead of the misleading zero the spec means to exclude. Fixed: a day only counts as a stockout day when it *also* shows zero usage (`usageQty.lte(0) && startOfDayStock.lte(0)`) — a day with real sales is real signal regardless of where stock stood at midnight. Verified: Tomato (5kg/day usage, 0 stock, 7-day target) correctly suggests 35kg; Sugar (4kg/day, 166kg stock, 60-day target) correctly suggests 100kg = 2×50kg bags, exactly matching `suggestReorderQty`'s own unit-tested rounding |
| Customer Profitability | **Done and verified** — `GET /reports/customer-profitability`, `Issue` group-by per customer for a period, biggest-revenue-first |
| Customer Statement | **Done and verified** — reuses the existing `GET /customers/:id/ledger` (built in Phase 2, never given a screen until now) behind a customer picker at `/reports/customer-statement`. Renders in the exact Date/Type/Ref/Debit/Credit/Balance shape from `SPEC.md` Part 4's own ledger mockup; the running Balance column was checked against the raw ledger for Al-Madina line by line |
| Wastage, Credit Utilization | **Not new reports** — the Reports hub links straight to the existing `/wastage` history (Phase 7) and `/customers` list (already shows outstanding/limit/utilization% with the same color coding used here), rather than building a second screen for data already presented well elsewhere |
| Collections, Stock Consumption, Price Trend, Supplier Comparison, Purchasing Variance | **Not built** — Collections is functionally covered by the existing `/payments` history (no dedicated period-summary view); the rest need either more historical purchase data than this dev database has to make a meaningful screen, or duplicate data already visible elsewhere (Consumption is most of what backs Reorder Suggestions, just not separately charted) |

### Exact scenarios verified (by hand against the dev database, then live in the browser)

```
P&L (Sept 1-12): revenue 6,765 - returns 825 = net revenue 5,940; cogs 5,551.23;
  gross margin 388.77 (6.54%); wastage loss 15,773.57 (all the Phase 7 test wastage);
  net margin -15,384.80 (-259.00%) -- every figure re-derived by hand and matched exactly
Margin erosion: set Tomato's floor to 10% (price 100, avg cost 127.86) -> flagged at -27.86%
Aging: Al-Madina 495 (current), Bismillah 5,400 (current, opening balance Aug 23),
  Karachi Grill 6,600 (31-60d, opening balance Jul 9, 30-day terms) -> totals 12,495,
  exactly the sum of all three customers' currentBalance
Reorder suggestions: Tomato 5kg/day, 0 stock, 7-day target -> suggests 35kg;
  Sugar 4kg/day, 166kg stock, 60-day target -> suggests 100kg (2 x 50kg bags)
Stock valuation grand total 93,498.06, hand-summed against all 10 active items
Customer profitability: Al-Madina 12 deliveries, revenue 6,765, cost 6,248.70, margin 7.63%
```

## Phase 9 — Hardening — **done**

Three items, all traceable to specific spec language rather than invented
scope: the nightly reconciliation job `SPEC.md` Part 6 requires
("`customer.currentBalance` and `item.currentStockQty`... verified against
the ledger/movement sum by a nightly job"), the daily expiry job
([05-edge-cases.md](./05-edge-cases.md)'s "Expired stock still shows as
available" row), and month-end closing (same doc's "Month-end closing" /
"Payment date backdated" rows). **No job scheduler was added** — this stack
deliberately has no BullMQ/queue (`SPEC.md` Part 11), and a `setInterval`
inside a `tsx watch` dev process that restarts on every file save would be
exactly the fragile, breaks-at-6am infrastructure the spec warns against.
Both "jobs" are plain, idempotent, read-only `GET` endpoints instead —
safe to call from the Reports screen on demand *and* from an external
scheduler (OS cron, Windows Task Scheduler, or the hosting provider's own
scheduled-task feature — Railway/Render/Vercel all have one) once this is
actually deployed. That external trigger is an ops step for deployment, not
something this repo runs itself, and the docs say so rather than implying a
job silently runs in the background today.

Building the month-end lock's settings surface also closed a real,
pre-existing gap: `wastageApprovalThreshold` and
`countVarianceApprovalThreshold` (added Phase 7) had no way to change them
short of raw SQL — no endpoint, no screen. Bundled into the same new
`/settings` page rather than leaving them stuck at their defaults forever.

| Task | Status |
|---|---|
| Reconciliation report | **Done, and verified against a deliberately-introduced mismatch** — [apps/api/src/routes/reports.ts](../apps/api/src/routes/reports.ts) `GET /reports/reconciliation`. For every customer, `expected = sum(CustomerLedger.debit) - sum(.credit)` compared to `customer.currentBalance`; for every item, `expected = sum(StockMovement.qty)` compared to `item.currentStockQty`. Deliberately **not** scoped to active/non-deleted rows — a stale number on a deleted record is still a stale number. Verified exactly as `docs/09-testing.md` describes: corrupted Al-Madina's balance by +1,000 directly in Postgres, the report caught it (`delta: "1000.00"`) precisely; corrupted Salt's stock by -5, caught precisely (`delta: "-5.0000"`); reverted both, report returned clean again |
| Expiry report | **Done and verified** — `GET /reports/expiry`. For each perishable item with stock on hand, finds its oldest still-open `PurchaseLot` past `expiryDate`. Same honest caveat as the Phase 5 picking-slip guidance: `PurchaseLot.remainingQty` isn't precisely decremented as stock is issued (issues cost on a weighted average, not FIFO lot consumption), so this flags the *item* as having expired stock somewhere in it, from a real batch/date, not a precise leftover quantity — a prompt to go look, not an automatic wastage write. Verified: received a real 5kg Tomato batch dated to have expired 7 days ago, the report flagged it correctly with the right batch number and day count; a "Log wastage" link on the row completes the suggested next step |
| Month-end period lock | **Done and verified live in the browser** — new `Warehouse.periodLockedBefore` (nullable date). `POST /payments` blocks (`409`) a `paymentDate` before it without a manager override, using the same `OverrideModal`/`POST /auth/authorize-override` pattern as every other threshold in this system. This is the *only* endpoint in the whole app that accepts a caller-supplied past date that affects the ledger — issues, returns, wastage, and stock counts are all always "now," so nothing else needed the check. Added a "Date (defaults to today)" field to the counter's Payment modal so the feature has a real, reachable UI path rather than being curl-only. Verified: set the lock to a future date (so "today" was blocked), a payment dated before it was blocked with the exact message, approved via owner PIN, resubmitted successfully, and the approval reason was recorded on the payment |
| `/settings` page | **Done** — [apps/web/app/(dashboard)/settings/page.tsx](<../apps/web/app/(dashboard)/settings/page.tsx>), `OWNER` only (the nav link is hidden for `MANAGER`, and the page itself redirects one who navigates there directly; `PATCH /warehouse` also 403s a `MANAGER` token server-side — verified both). Exposes the two Phase 7 thresholds and the new period-lock date in one place |

### Exact scenarios verified

```
Reconciliation: UPDATE'd Al-Madina's currentBalance to 1855 directly in Postgres (real was 855)
  -> GET /reports/reconciliation returned {delta: "1000.00", stored: "1855.00", expected: "855.00"}
  UPDATE'd Salt's currentStockQty to 140 (real was 145)
  -> returned {delta: "-5.0000", stored: "140.0000", expected: "145.0000"}
  Both reverted -> report clean again; a real payment recorded in between stayed clean too
Expiry: received 5kg Tomato with expiryDate backdated to 7 days ago (batch TEST-EXPIRED-1)
  -> flagged correctly: "5 kg", "TEST-EXPIRED-1", "7d ago"
Period lock: set periodLockedBefore to a future date -> a payment dated "today" was blocked
  with "The books are closed before 2026-08-01...", owner-PIN override -> resubmitted -> 201,
  Payment.notes recorded "Dated before period lock; approved by Faisal Sheikh: <reason>"
  MANAGER token correctly got 403 on PATCH /warehouse but 200 on GET /warehouse
```

## Phase 10 — Reports rebuild and Reports hub — **done**

**Trigger:** after Phase 9 and the units/categories/suppliers CRUD above, the
client sent a redesign brief (logo adjustments, a
link to a brand-asset repo, general styling and
pagination feedback, and a structured Part A / Part B scope).
Part A proposed *deleting* Stock Counts, Purchase Orders, Stock Adjustments,
Stock Transfers, and Price Lists, merging screens, and restricting
`MANAGER`'s report access. Rather than executing a pasted brief mechanically,
each consequential piece was confirmed with the client first. Answers:
**keep Stock Counts as-is** (no deletion), **keep `MANAGER`'s report access
as-is** (no restriction), **rebuild the reports to match the brief's "Part B"
exactly**. This phase is that third answer. Part A's deletions were never
made — nothing described in this section removes Stock Counts, Purchase
Orders, or any other existing screen.

**Logo fix** (done first, uncontroversial): the sidebar and counter-header
wordmark were rendered too small and not vertically centered —
[apps/web/app/(dashboard)/layout.tsx](<../apps/web/app/(dashboard)/layout.tsx>)
(`h-9` → `h-11`, added `flex items-center`) and
[apps/web/app/counter/page.tsx](../apps/web/app/counter/page.tsx) (`h-8` →
`h-9`). [ADR-007](./06-decisions.md#adr-007-design-system-built-from-the-real-dineiz-brand-assets-not-invented) already covered why this app uses the
tightly-cropped `transparent/logos/...` asset variant — this was pure CSS
sizing, not a wrong asset, so no new asset work was needed.

**Shared reports infrastructure, new this phase:**
- `.a4-report` class hierarchy in `apps/web/app/globals.css`, under its own
  named `@page report { size: A4; margin: 15mm }` — the existing thermal
  receipt printing uses an *unnamed* `@page { size: 80mm auto }` rule, so the
  two never collide; `.a4-report { page: report }` opts a print page in.
- `GET /warehouse/letterhead` +
  [components/reports/letterhead.tsx](../apps/web/components/reports/letterhead.tsx) —
  one letterhead component/hook every report's print page and PDF export
  both call, instead of each hand-rolling its own header.
- [lib/report-pdf.ts](../apps/web/lib/report-pdf.ts) (jsPDF v4 +
  jspdf-autotable v5 — v5's `autoTable(doc, options)` is a named export, not
  `doc.autoTable()`, but still sets `doc.lastAutoTable.finalY` for cursor
  tracking) and [lib/report-excel.ts](../apps/web/lib/report-excel.ts)
  (SheetJS) — both build the file in-browser, neither uploads anything.
- The print-page pattern from Phase 5 (a route outside `(dashboard)`, at
  `/reports/<slug>/print`, `useSearchParams` + `Suspense`, auto-`window.print()`
  after the data loads, a `no-print` manual button fallback) reused for every
  report below rather than invented per-report.

**The ten reports** (built in the brief's own order; ✱ = renamed/merged from
a Phase 8 report, ✚ = new this phase):

| # | Report | What changed |
|---|---|---|
| 1 | Customer Statement ✱ | `GET /customers/:id/ledger` gained `?from=&to=`, an `openingBalance`, and an `aging` block. **Real bug found and fixed**: closing balance was read from the last row's *stored* `balanceAfter` after sorting by date — a backdated test payment sorted earlier than same-day rows inserted after it, so the literal last row wasn't the most recent by insertion order, showing 855.00 instead of the true 555.00. Fixed by recomputing a running balance in display order instead of trusting each row's stored value. See [08-api.md](./08-api.md) |
| 2 | Daily Summary ✚ | New. `GET /reports/daily-summary` |
| 3 | Receivables Aging ✱ | Renamed from `/reports/aging`; rebucketed 5→4 buckets (`current` now 0-7 days past due). See [08-api.md](./08-api.md) |
| 4 | Stock Report ✱ | Renamed from `/reports/stock-valuation`; category grouping + status. **Real bug found and fixed**: `expiringSoon` had no lower bound on the date filter, so already-expired lots were miscategorized as "expiring soon." Fixed to `{ gte: now, lte: soon }` |
| 5 | Reorder List ✱ | Renamed from `/reports/reorder-suggestions`; added urgency tiers and a by-supplier shopping list |
| 6 | Profit & Loss ✱ | Renamed from `/reports/pnl`; added a `losses` breakdown and an explicitly-untracked `expenses` block |
| 7 | Item Profitability ✱ | Merged `/reports/margin-by-item` + `/reports/margin-erosion`; sorted by profit contribution (absolute), not margin % |
| 8 | Purchase Register ✚ | New |
| 9 | Wastage Report ✚ | New — Phase 8 only had the raw `/wastage` history list |
| 10 | Sales by Customer ✱ | Renamed/rebuilt from `/reports/customer-profitability`; drops cost/margin (not appropriate for a customer-facing rank), adds returns/net/owes and a sales-weighted return-rate section |

Every report has an on-screen page, an A4 print page, a PDF download, and an
Excel download. Every number was checked two ways: a direct `curl` against
the dev database (cross-checked by hand — e.g. Sales by Customer's `owes`
against `customer.currentBalance`, its return-rate math against the brief's
own worked example to the decimal) and then the same report loaded live in
the browser.

**Reports hub rewritten** —
[apps/web/app/(dashboard)/reports/page.tsx](<../apps/web/app/(dashboard)/reports/page.tsx>)
regrouped into the brief's own five sections (Daily / Money / Stock /
Purchases / Customers) plus a pre-existing "Data integrity" section
(Reconciliation, Expired Stock — Phase 9 tools with no other home, kept
rather than orphaned). Two entries from the brief's own hub mockup were
**not** added: "Orders Today" isn't a separate report — Daily Summary's own
response already carries an `orders` list with a Paid/Partial/Unpaid status,
which is exactly what that mockup entry described. "Supplier Balances"
genuinely cannot be built honestly yet — it would need

## Customer credit limit — removed

Per explicit request, the credit-limit cap on customers was removed
entirely — not disabled, not relaxed, the field and every check/display
built on it. Previously: `Customer.creditLimit`, a soft-block in `POST
/issues` (409 `overCredit: true` once balance would exceed it, requiring a
manager override), an amber/red warning on the counter screen and customer
picker, a "Credit limit / Available" line on the printed delivery note and
customer statement, and an `overCreditLimit` flag on both Receivables Aging
and Sales by Customer.

All of it is gone: `apps/api/src/routes/issues.ts` only blocks on
insufficient stock now; `apps/api/src/routes/customers.ts`,
`apps/api/src/routes/reports.ts`, `apps/web/lib/types.ts`, every affected
report page (on-screen + print), the customer form, the customers list,
the counter screen, `customer-picker.tsx`, and `delivery-note.tsx` were all
updated to match. `Customer.creditLimit` was dropped from the schema via
migration `20260913222033_remove_customer_credit_limit`. `creditDays`
(payment terms, used only for aging buckets) is untouched — that's a
separate concept and was never part of this request.

## Opening-stock unit conversion — real bug found and fixed

Reported symptom: creating an item bought in "Bori" (a 50kg bag) and sold in
kg, entering 5 as the opening quantity, produced 5kg of stock, not 250kg —
and average cost came out 0 even after entering a cost.

Root cause: `POST /items`' opening-stock handling took a single flat
`openingQty`/`openingCost` from the form and wrote it straight into
`currentStockQty`/`avgCostPerUnit` with **no unit conversion at all** —
unlike `goods-receipts.ts`, which has always correctly converted
`qtyInPurchaseUnit × factor → qtyInSellUnit` and
`unitCostPurchaseUnit ÷ factor → unitCostSellUnit`. The item-creation form
asked for a bare "Quantity" with no unit shown, so there was no way to
express "5 bags" correctly even if the backend had converted it.

Fixed by mirroring `goods-receipts.ts`'s exact conversion, and reshaping the
"Starting stock" section of [item-form.tsx](../apps/web/components/items/item-form.tsx)
to match how someone actually counts stock:
- **Full `<purchase unit>` you have** (e.g. "Full BAG50 you have") — multiplied
  by the purchase→sell factor.
- **Extra loose `<sell unit>`** (only shown when the purchase and sell units
  actually differ) — for a partial amount that isn't a full bag, e.g. an
  opened sack with 30kg left. Both add together into the total.
- **Cost per `<purchase unit>`** — converted to a per-sell-unit average cost
  the same way a receipt's cost is.
- A live line — `= 280 kg @ PKR 3.40/kg · total cost PKR 952` — renders
  under the inputs as they're typed, so the math is visible before saving,
  not just trusted.

Also fixed while in the area:
- **"Selling price (per unit)" was ambiguous** — now reads "Selling price
  (per kg)" (or whatever the chosen sell unit is), updating live as the sell
  unit is changed.
- **A fresh warehouse had zero units** — `create-account.ts` (the real,
  non-demo provisioning script) now seeds Kilogram, Gram, Litre, Millilitre,
  Piece, and Dozen for a brand-new warehouse, so Setup > Units isn't empty
  on day one. The dev seed script (`seed.ts`) already had its own richer set
  and was untouched.

## Production incident: two tenants sharing one warehouse

`create-account.ts` was run a second time in production, against a database
that already had a real client's warehouse, to create a separate Dineiz
admin login (`supply@dineiz.com`). Its `prisma.warehouse.findFirst()` had no
filter, so it silently reused the client's existing warehouse instead of
creating a new one -- the admin login was attached to the client's tenant.
From that point every read and write from either account hit the exact same
`warehouseId`, so admin actions (a customer, categories, units, several
issues and payments, a completed stock count) landed in the client's real
data instead of being isolated.

No client data was lost or deleted to fix this -- confirmed via
`AuditLog` (filtered by `actorId`) that everything attributed to the admin
account was real, wanted work, not throwaway test data (one obvious test
item aside, left for the owner to deactivate manually rather than deleted
by script). The fix was additive only: a new warehouse, the admin `User`
row's `warehouseId` repointed at it, and the client's units/categories/
active items copied in as a starting catalogue (stock and average cost
reset to 0, since the new warehouse has no physical stock of its own).
Fixed at the source: `create-account.ts` now requires an explicit
`WAREHOUSE_NAME` env var and looks up by that name instead of "whichever
warehouse exists first," making this class of mistake structurally
impossible rather than merely unlikely.

Also raised while sorting this out: an item's own edit page only ever had a
link out to `/receiving/new?itemId=...` for adding stock -- no way to do it
without leaving the item. Added a `QuickAddStockModal`
([apps/web/components/items/quick-add-stock-modal.tsx](../apps/web/components/items/quick-add-stock-modal.tsx))
opened right from the item page's "+ Add stock" button; it calls the exact
same `POST /goods-receipts` endpoint Receiving itself uses (same moving-
average cost math, same >50%-above-average variance flag), not a second,
parallel way of adding stock. Verified live: adding 2 BAG50 @ PKR 9,000 to
an item at 83kg/PKR 205 avg landed on 183kg/PKR 191 avg, in place, with no
navigation away from the item.
- **No quick way to add stock from the Items list** — the list page only
  ever had "+ New item"; each row now has its own "+ Add stock" link
  straight to Receiving with that item preselected (the item's own edit page
  already had this; it just wasn't on the list).

`pnpm typecheck` passes clean across the whole workspace.

Verified: `pnpm typecheck` passes clean across the whole workspace; the
Item form's own buy/sell conversion flow (a separate, unrelated fix earlier
the same day) was re-checked and still works.
`GoodsReceipt.paidAmount` to actually be written somewhere, and nothing in
this codebase writes it (same gap Purchase Register and Daily Summary both
already document). Building either would mean fabricated data or a dead
link; both are left out rather than faked.

**Explicitly not touched this phase**, despite being raised in the same
client message: table pagination for large datasets, and broader
"vibecoded"/AI-generated-feeling UI polish beyond the logo. The client's
own follow-up questions were answered narrowly (Stock Counts, `MANAGER`
access, reports scope) — pagination and general UI polish weren't part of
what was confirmed, so they're logged here as open rather than assumed.

## Environment notes for whoever continues this

- **Local dev database**: a dedicated Docker container `dineiz_supply_db`
  (Postgres 16, port **5433**, not 5432 — this machine already has a
  native Postgres service bound to 5432, see
  [ADR](./06-decisions.md#adr-006-prisma-migrate-dev--migrate-reset-dont-run-in-this-environment--write-migrations-by-hand)-adjacent
  note: check `docker ps` before assuming a port is free). Credentials in
  `packages/db/.env` (gitignored).
- **Seed data**: `pnpm --filter @dineiz-supply/db seed`. Login as
  `owner@alnoor.pk` / `owner123` (PIN 9999), `manager@alnoor.pk` /
  `manager123` (PIN 5678), or clerk "Ahmed Khan" PIN `1234`.
- **Running both apps**: run `pnpm dev:api` (port 4000) and `pnpm dev:web` (port 3000).
- **Applying migrations**: see [ADR-006](./06-decisions.md).
  Use `prisma migrate deploy` to apply migrations.

## Phase 11 — Production readiness — **done**

Triggered by a direct ask to prepare the app for deployment. The API had
never actually been built or run in a production configuration; doing so
for the first time surfaced a real, deployment-blocking bug, fixed alongside
the standard hardening pass.

| Task | Status |
|---|---|
| API production boot | **Fixed a real, verified-blocking bug** — `pnpm --filter @dineiz-supply/api build && node dist/index.js` crashed instantly with `ERR_UNKNOWN_FILE_EXTENSION` on `packages/db/src/index.ts`. `@dineiz-supply/db`/`@dineiz-supply/logic` ship only `.ts` (`"main": "./src/index.ts"`, no build step, by design per [01-architecture.md](./01-architecture.md)) — this only ever worked in dev because `tsx watch` transpiles on the fly. Fixed by running the API the same way in production: `apps/api/package.json`'s `start` is now `tsx src/index.ts` (was `node dist/index.js`), `tsx` moved to `dependencies`. No dev/prod behavioral gap any more |
| `JWT_SECRET` hard-fail in production | **Done** — [apps/api/src/env.ts](../apps/api/src/env.ts) now throws at startup if `JWT_SECRET` is unset and `NODE_ENV=production`, instead of silently signing tokens with the public dev-default string. Dev behavior (warn + fallback) unchanged |
| `CORS_ORIGIN` multi-origin support | **Done** — now comma-separated, so prod can allow apex + `www` without a code change |
| `trustProxy` | **Done** — added to the Fastify instance so rate limiting and logged IPs reflect the real client behind any managed host's reverse proxy, not the proxy's own IP |
| Safe migration-deploy path | **Done** — `pnpm db:migrate:deploy` (→ `prisma migrate deploy`, the non-interactive command from [ADR-006](./06-decisions.md#adr-006-prisma-migrate-dev--migrate-reset-dont-run-in-this-environment--write-migrations-by-hand)); the pre-existing `pnpm db:migrate` (`migrate dev`) must never be run against a real database |
| Next.js production hardening | **Done** — `apps/web/next.config.mjs` now sets `output: "standalone"` (small Docker image) and baseline security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) |
| Docker images | **Done and verified** — `apps/api/Dockerfile`, `apps/web/Dockerfile` (both multi-stage, pnpm-workspace-aware, non-root user), `.dockerignore`, and a root `docker-compose.yml` for local prod-mode verification only (not a production orchestrator — see its header comment and [10-deployment.md](./10-deployment.md)). Verified: built both images, ran the full stack via `docker compose up` against a throwaway Postgres, confirmed `/health`, login, and an authenticated API call all worked through the compiled container, not just `pnpm dev` |
| CI | **Done** — `.github/workflows/ci.yml`: install, `prisma migrate deploy` against a Postgres service container, typecheck, `packages/logic` tests, API build (type/schema-drift gate), web build |
| Deployment runbook | **Done** — new [10-deployment.md](./10-deployment.md): env vars, migration step, Docker build/run commands, Vercel-for-web alternative, smoke test, pre-launch checklist. Linked from `README.md` and this vault's index |
| Git history | **Done** — the repo had zero commits before this phase (`git log` was empty); an initial commit of the pre-existing codebase plus a separate commit for this phase's changes were created |

Not done, deliberately out of scope for this pass: an error tracker (e.g.
Sentry) and uptime monitoring — recommended in the runbook's checklist, but
adding a new dependency/service wasn't asked for and isn't required to go
live; automated backups are a host-side setting, not something this repo
can configure from inside the container.

## Blocked on

Nothing technical. Before Phase 3+ goes much further, the five open
questions in `SPEC.md` Part 0 should be confirmed with the actual client.
