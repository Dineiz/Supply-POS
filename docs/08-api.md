# API

Base URL: `http://localhost:4000` in dev (`NEXT_PUBLIC_API_URL` on the web
side, `CORS_ORIGIN` on the API side). All endpoints below exist and have
been exercised against the real dev database (curl + the actual browser UI),
not just written.

## Conventions

- Every protected route requires `Authorization: Bearer <jwt>`. The JWT
  payload is `{ sub, warehouseId, role, name }`; `warehouseId` always comes
  from the token, never from the request body.
- Money/quantity fields serialize as **strings** (Prisma's `Decimal` has a
  `toJSON()` that stringifies) — e.g. `"144.5"`, not `144.5` — to avoid
  float precision loss over JSON. Parse back into `Decimal` on the client
  before doing arithmetic; `packages/logic`'s `Decimal` re-export is
  available to `apps/web` too if needed.
- List endpoints `select` only the columns the UI displays, never `include`
  a full relation graph.

## `POST /auth/login`

Request: `{ email, password }` **or** `{ pin }`. PIN login is checked
against every active CLERK's `pinHash` (there's exactly one warehouse today,
so this doesn't need to be warehouse-scoped yet — see the code comment in
`apps/api/src/routes/auth.ts` for what breaks first if a second warehouse is
added: PIN collisions across warehouses aren't handled, a warehouse-select
step would need to come first).

Response: `{ token, user: { id, name, role, warehouseId } }`
Errors: `401` wrong credentials/PIN, `400` neither mode provided, `429`
after 10 attempts/minute.

## `POST /auth/authorize-override`

Requires auth. Body: `{ pin, reason }` or `{ email, password, reason }`.
Checks the credentials belong to an active OWNER/MANAGER **in the caller's
own warehouse**. On success, writes an `AuditLog` row (`OVERRIDE_AUTHORIZED`)
and returns `{ authorized: true, authorizedById, authorizedByName }` — no
new token is issued, this doesn't change who's logged in.
Errors: `400` missing reason, `401` not a valid manager/owner.

## `GET /auth/me`

Requires auth. Returns the decoded JWT payload — a cheap way for the
frontend to check "am I still logged in" without a dedicated endpoint.

## `GET /items`

Requires auth. Returns active, non-deleted items for the caller's
warehouse: `{ id, name, nameUrdu, barcode, category, unitCode, stockQty,
avgCost, price, minStockQty, isPerishable }`, ordered by `sortOrder, name`.

## `GET /customers`

Requires auth. Returns active customers: `{ id, name, nameUrdu, code, type,
currentBalance, creditLimit, creditDays, discountPercent }`, ordered by
name.

## `POST /issues`

Requires auth and an `x-idempotency-key` header (any non-empty string;
the counter screen uses `crypto.randomUUID()` per order, regenerated after
each successful submit).

Request:
```
{
  customerId: string,
  lines: [{ itemId: string, qty: number, unitPrice?: number, discountPercent?: number }],
  paidAmount?: number,
  paymentMethod?: "CASH" | "BANK_TRANSFER" | "JAZZCASH" | "EASYPAISA" | "CHEQUE",
  notes?: string,
  receivedByName?: string,
  override?: { authorizedById, authorizedByName, reason }   // from /auth/authorize-override
}
```

Behavior, all inside one Prisma transaction (see
[04-flows.md](./04-flows.md#issue-phase-4--implemented) for the full
step list):
- Resolves each line's price (falls back to `item.baseSellPrice`) and cost
  (`item.avgCostPerUnit`), computes totals via `calculateIssueTotals`
  (customer's `discountPercent` applied on top of any per-line discount).
- **Without** `override`: `409` if any line would take stock negative
  (`shortItems` lists which) or if the new balance would exceed
  `creditLimit` (`overCredit: true`). **With** `override`: proceeds anyway,
  and a negative-stock line's `StockMovement.reason` records the override
  reason.
- Freezes `itemName`, `unitCode`, `unitPrice`, `unitCost` onto each
  `IssueLine`; decrements stock; writes one `StockMovement` per line; writes
  a `CustomerLedger` debit row; updates `Customer.currentBalance`.
- If `paidAmount > 0`: applies it to *this* issue via `allocatePayment`
  (oldest-first logic, but against a single "invoice" — this new issue; the
  dedicated `POST /payments` endpoint below is what allocates across a
  customer's *other* open issues), creates `Payment` + `PaymentAllocation` +
  a ledger credit row.
- Idempotency: a duplicate `x-idempotency-key` returns the original issue
  (`200`, not `201`) instead of creating a second one — verified both for a
  same-process resubmit and for the race case (two inserts hitting the
  unique constraint simultaneously; the loser re-fetches and returns the
  winner's row instead of erroring).

Response: `201` with the created `Issue` (including `lines`), or `200` with
the existing one on idempotent replay.
Errors: `400` missing customerId/lines or missing idempotency header, `404`
unknown customer/item, `409` stock/credit block (see above).

## `GET /issues`, `GET /issues/:id`

Requires auth. List accepts `?customerId=` to scope to one customer (used by
the return modal's "which delivery is this for?" picker) and always filters
to `status: ISSUED`, newest first, capped at 50. Each row includes `lines`
(`id, itemName, qty, returnedQty`) so the UI can tell which lines still have
returnable quantity without a second request. Detail includes full `lines`
with each line's `item` (`isPerishable`, `returnWindowHours`) so a return
form can compute the perishable-window hint client-side (the server enforces
it independently — the client hint is a courtesy, not the source of truth).

## `GET /issues/:id/print-data`

Requires auth. Everything the two printed documents need in one call:
`issue` (numbers, dates, lines — each with `isPerishable`/`location` pulled
from its item), `customer`, `warehouse` (name/address/phone/NTN/currency/
`defaultReturnWindowHours`), `oldestUnpaid` (from the same
`getOutstandingIssues` helper used by payments — the oldest currently-owed
invoice for this customer, which may be this issue itself), and
`perishableGuidance` (a map of `itemId` → the oldest `PurchaseLot` with
`remainingQty > 0` for that item, `{ receivedAt, batchNumber }` — see the
limitation noted in
[07-progress.md](./07-progress.md#phase-5--printing--done) about
`remainingQty` not being precisely maintained by the issue flow).

## `POST /issues/:id/print`

Requires auth. No body. Increments `Issue.printCount` and returns the new
count — called once per print (including the first) so the client knows
whether to show "REPRINT — COPY n". Note: this was the one endpoint in the
whole app called with no request body, which surfaced a real bug in the
shared `apiFetch` helper (it always sent `Content-Type: application/json`
even with an empty body, and Fastify correctly rejects that combination
with `400`) — fixed by only setting that header when a body is actually
present.

## `GET/POST/PATCH/DELETE /units`, `/categories`

Full CRUD, requires auth **and** `OWNER`/`MANAGER` for the mutating verbs
(`GET` is any role — both lists still back the item form's dropdowns).
`Unit`: `{ id, code, name, type, baseUnitId, factorToBase }`. `Category`:
`{ id, name, colorHex, isPerishable, defaultReturnWindowHours }`. Both live in
[`apps/api/src/routes/units.ts`](../apps/api/src/routes/units.ts) (categories
included in the same file). Presented at `/setup/units` and
`/setup/categories` behind the `/setup` hub. `DELETE` is blocked (`409`) while
any item still references the row — matches the existing item/customer
soft-delete philosophy of never leaving a dangling foreign key.

## `GET /items/:id`, `GET /customers/:id`

Requires auth. Single-record detail for edit forms — same shape as the list
endpoints' rows.

## `POST /items`, `PATCH /items/:id`, `DELETE /items/:id`

Requires auth **and** `OWNER` or `MANAGER` role (`403` otherwise — verified
with a clerk token). `POST` body requires `name`, `purchaseUnitId`,
`sellUnitId`, `baseSellPrice`; optional `openingQty`/`openingCost` create an
`OPENING` `StockMovement` in the same transaction. `location` (added in
Phase 5, for the printed picking slip's rack guidance) is a free-text
optional field on both `POST` and `PATCH`. `reorderDays` (added in Phase 8,
for the Reorder Suggestions report) is an optional integer on both — `null`
means "not tracked," never flagged by that report. `PATCH` deliberately
excludes `purchaseUnitId`, `sellUnitId`, `purchaseToSellFactor`,
`currentStockQty`, `avgCostPerUnit` — those can only move through a receipt,
issue, wastage, or count adjustment, never a direct edit. `DELETE` soft-
deletes (`isActive: false, isDeleted: true`) — not exposed in the UI yet,
only `PATCH { isActive }` (Deactivate/Reactivate) is. Duplicate `name`
(items) or `code` (customers) returns `409`. Every mutation writes an
`AuditLog` row via `apps/api/src/lib/audit.ts`.

## `POST /customers`, `PATCH /customers/:id`, `DELETE /customers/:id`

Same auth/role rules as items. `POST` body requires `name`; optional
`openingBalance` (positive or negative) creates an `OPENING_BALANCE`
`CustomerLedger` row. `PATCH` excludes `currentBalance` — it only changes
through issues, returns, and payments.

## `GET /customers/:id/outstanding-issues`

Requires auth (any role — used by the counter-screen Payment modal). Returns
`[{ id, issueNumber, issuedAt, totalAmount, paidAmount, balance }]`, oldest
first, only issues with `balance > 0`. `paidAmount` sums only
`PaymentAllocation`s whose `Payment.isReversed` is `false`, so a reversed
payment's allocations don't count — the affected issue reappears as
outstanding automatically. Shared implementation:
[`apps/api/src/lib/ledger.ts`](../apps/api/src/lib/ledger.ts), also used
internally by `POST /payments`.

## `GET /customers/:id/ledger`

Requires auth. Query: `?from=YYYY-MM-DD&to=YYYY-MM-DD` (both optional;
default is the start of the current calendar month through now). Returns
`{ openingBalance, entries: [{ id, entryType, refNumber, debit, credit,
balanceAfter, entryDate, description }], closingBalance, aging }`, entries
oldest first within the range. `openingBalance` sums every ledger row
*before* `from`. `balanceAfter` on each returned entry is **recomputed** as a
running total in display order, not read from the row's own stored
`balanceAfter` column — a backdated entry can sort earlier than rows inserted
before it, which made the stored value on the literal last row wrong in
exactly one real case (see [07-progress.md](./07-progress.md) Report 1,
Customer Statement). `aging` buckets the customer's *whole* ledger (not just
this range) with [`ageLedgerDebits`](../packages/logic/src/aging.ts) —
`current` (0-7 days past due) / `d8_15` / `d16_30` / `d30_plus`, the same
buckets and the same function `GET /reports/receivables-aging` uses, so the
two reports never disagree on what a customer owes. Presented at
`/reports/customer-statement` behind a customer picker and date range, with
print/PDF/Excel export.

## `GET/POST/PATCH/DELETE /suppliers`

Full CRUD, requires auth **and** `OWNER`/`MANAGER` for the mutating verbs.
`GET` (any role): `{ id, name, contactName, phone }`, active only by default
(`?includeInactive=true` to see deactivated ones too), sorted by name — same
list backs the receiving form's dropdown. `DELETE` is a soft deactivate
(`isActive: false`), not a hard delete — a supplier is referenced by
historical `GoodsReceipt` rows that must keep resolving a name, so nothing
about a supplier is ever actually removed. Presented at `/setup/suppliers`.

## `GET /goods-receipts`, `GET /goods-receipts/:id`

Requires auth **and** `OWNER`/`MANAGER`. List returns
`{ id, receiptNumber, receivedAt, totalAmount, receivedByName,
supplierInvoiceNumber, supplier, lineCount, hadVariance }` — `hadVariance`
is true if any line was variance-flagged, used to show the "Price variance"
badge in the history list without a separate request. Detail returns the
full record with `lines` (each including its `item`).

## `POST /goods-receipts`

Requires auth and `OWNER`/`MANAGER`. Body:
```
{
  supplierId: string,
  supplierInvoiceNumber?: string,
  supplierInvoiceDate?: string,
  lines: [{ itemId, qtyInPurchaseUnit, unitCostPurchaseUnit, expiryDate?, batchNumber? }],
  notes?: string,
  acknowledgeVariance?: boolean
}
```
Quantity and cost are entered **in the item's purchase unit** (matching a
real supplier invoice — "1 bag, Rs 7,600" — not the sell unit). The endpoint
converts to sell-unit terms via `item.purchaseToSellFactor` before costing.

For each line, variance = `(unitCostSellUnit - item.avgCostPerUnit) /
item.avgCostPerUnit`, skipped entirely when `avgCostPerUnit` is `0` (an
item's first-ever receipt has no baseline to compare against). If any line's
variance exceeds 50% and `acknowledgeVariance` isn't `true`, the whole
receipt is rejected with `409` and a `flaggedLines` array
(`itemId, name, currentAvgCost, newCost, variancePercent`) — **nothing is
written**; the caller is expected to show the user those lines and resubmit
with `acknowledgeVariance: true` if confirmed correct.

On success (`201`): creates one `PurchaseLot` + `GoodsReceiptLine` per line,
updates `Item.currentStockQty`/`avgCostPerUnit`, writes one
`PURCHASE_RECEIVED` `StockMovement` per line, and an `AuditLog` row. Returns
the created `GoodsReceipt` with `lines`.

Errors: `400` missing `supplierId`/lines, `404` unknown supplier/item, `409`
variance block (see above), `403` non-owner/manager role.

## `GET /returns`

Requires auth **and** `OWNER`/`MANAGER`. History list:
`{ id, returnNumber, createdAt, totalCreditAmount, totalCostWrittenOff,
returnedByName, customer, lines }`.

## `POST /returns`

Requires auth (any role — created from the counter screen). Body:
```
{
  customerId: string,
  originalIssueId?: string,
  lines: [{ itemId, issueLineId?, qty, creditUnitPrice?, condition?: "GOOD"|"DAMAGED"|"EXPIRED"|"WRONG_ITEM" }],
  reason?: string,
  notes?: string,
  returnedByName?: string
}
```
Each line resolves independently: if `issueLineId` is given, it must belong
to `originalIssueId` (or any issue for that customer, if you omit
`originalIssueId` but still pass a specific `issueLineId`), `creditUnitPrice`
defaults to that line's frozen `unitPrice`, and qty is capped at
`issueLine.qty - issueLine.returnedQty` (`409` if exceeded). Without
`issueLineId`, `creditUnitPrice` defaults to `item.baseSellPrice` and the
cost basis is `item.avgCostPerUnit` (today's average, since there's no
historical record to use instead).

`condition` defaults to `GOOD` but is **overridden server-side** to
`DAMAGED` when the item `isPerishable` and more than
`item.returnWindowHours` (fallback: `warehouse.defaultReturnWindowHours`)
have passed since `originalIssue.issuedAt` — regardless of what the request
sent. `GOOD`/`WRONG_ITEM` restore stock; `DAMAGED`/`EXPIRED` create a
`Wastage` row (`attributedTo: CUSTOMER_RETURN`) instead.

Response: `201` with the created `ReturnNote` + `lines`.
Errors: `400` no customerId/lines, `404` unknown customer/issue/item, `409`
over-return against a linked line.

## `GET /payments`

Requires auth **and** `OWNER`/`MANAGER`. History list:
`{ id, paymentNumber, amount, method, paymentDate, receivedByName,
isReversed, reverseReason, customer }`.

## `POST /payments`

Requires auth (any role — created from the counter screen). Body:
```
{
  customerId: string,
  amount: number,
  method: "CASH" | "BANK_TRANSFER" | "JAZZCASH" | "EASYPAISA" | "CHEQUE",
  reference?: string,
  paymentDate?: string,
  notes?: string,
  allocations?: [{ issueId: string, amount: number }],   // manual override, optional
  approval?: { authorizedById, authorizedByName, reason }   // from /auth/authorize-override
}
```
Without `allocations`: allocates oldest-first via `allocatePayment` against
`getOutstandingIssues`. With `allocations`: each `issueId` must be a real
outstanding issue for that customer and each `amount` capped at that issue's
real balance (`400` otherwise); the sum may be less than `amount` — the rest
becomes an unallocated credit, same as the automatic path.

**Month-end lock (Phase 9):** if `warehouse.periodLockedBefore` is set and
`paymentDate` (default: now) falls before it, `409`s with
`{ message, periodLockedBefore }` unless `approval` is attached — the only
place in this API a caller-supplied past date can affect the ledger, since
every other creation endpoint always dates itself "now." With `approval`,
the override is recorded in `Payment.notes` (no schema change needed for
this rare path) and via the usual `AuditLog` row.

Response: `201` with the created `Payment` + `allocations`.
Errors: `400` missing fields / bad manual allocation, `404` unknown
customer/issue, `409` period-lock block (see above).

## `POST /payments/:id/reverse`

Requires auth **and** `OWNER`/`MANAGER`. Body: `{ reason: string }`
(required). Marks the payment `isReversed: true`, writes a reversing
`CustomerLedger` entry (`entryType: ADJUSTMENT`, debit = the payment amount),
and restores `Customer.currentBalance`. `404` unknown payment, `409` already
reversed, `400` missing reason.

## `GET /wastage`

Requires auth **and** `OWNER`/`MANAGER`. History list:
`{ id, wastageNumber, createdAt, qty, unitCode, costImpact, reason,
attributedTo, reportedByName, approvedByName, item }`, newest first.

## `POST /wastage`

Requires auth **and** `OWNER`/`MANAGER`. Body:
```
{
  itemId: string,
  qty: number,
  reason: "SPOILED" | "EXPIRED" | "DAMAGED" | "PEST" | "THEFT" | "POWER_OUTAGE" | "SPILLAGE" | "QUALITY_REJECT" | "OTHER",
  notes?: string,
  photoUrl?: string,
  approval?: { authorizedById, authorizedByName, reason }   // from /auth/authorize-override
}
```
`actualQty = min(qty, max(item.currentStockQty, 0))` — a request for more than
what's on hand is silently clamped to the stock on hand rather than going
negative, and the clamp is recorded in `notes` as an anomaly.
`costImpact = actualQty × item.avgCostPerUnit`. **Without** `approval`: `409`
with `{ costImpact, threshold }` if `costImpact` exceeds
`warehouse.wastageApprovalThreshold` (default 2000) — nothing is written.
**With** `approval`: proceeds regardless, `approvedById`/`approvedByName`
recorded on the `Wastage` row.

On success (`201`): creates the `Wastage` row (`wastageNumber` `WST-YYMM-NNNN`,
`attributedTo: WAREHOUSE`), decrements `item.currentStockQty`, writes a
`StockMovement` (`WASTAGE`, average cost unchanged), `AuditLog` row. Returns
`{ id, wastageNumber, qty, costImpact, clamped }`.

Errors: `400` missing `itemId`/positive `qty`/`reason`, `404` unknown item,
`409` threshold block (see above).

## `GET /stock-counts`, `GET /stock-counts/:id`

Requires auth **and** `OWNER`/`MANAGER`. List:
`{ id, countNumber, status, type, itemsCounted, itemsWithVariance,
totalVarianceValue, startedByName, startedAt, completedAt, lines }`, newest
first. Detail includes full `lines`, each with its `item`
(`id, name, avgCostPerUnit, sellUnit`) so the counting screen can show a live
cost-impact preview without a round trip per keystroke.

## `POST /stock-counts`

Requires auth **and** `OWNER`/`MANAGER`. Body:
```
{
  type: "FULL" | "PARTIAL" | "SPOT",
  categoryId?: string,   // required if type is PARTIAL
  itemIds?: string[],    // required if type is SPOT
  notes?: string
}
```
Resolves the matching active items (all of them for `FULL`, one category for
`PARTIAL`, the given list for `SPOT`), creates a `StockCountSession`
(`countNumber` `CNT-YYMM-NNNN`, `status: IN_PROGRESS`) and one
`StockCountLine` per item with `systemQty` snapshotted from
`item.currentStockQty` and `countedQty` initialized equal to it (zero variance
until the counter changes it).

Errors: `400` missing `type` / missing `categoryId` for `PARTIAL` / missing
`itemIds` for `SPOT` / no items match the scope.

## `PATCH /stock-counts/:id/lines/:lineId`

Requires auth **and** `OWNER`/`MANAGER`. Body: `{ countedQty: number, notes?:
string }`. Recomputes `variance = countedQty - systemQty` and
`varianceValue = variance × item.avgCostPerUnit` against the line's frozen
`systemQty`. `409` if the session isn't `IN_PROGRESS` any more.

## `POST /stock-counts/:id/cancel`

Requires auth **and** `OWNER`/`MANAGER`. No body. Only valid from
`IN_PROGRESS`; sets `status: CANCELLED` and touches no stock. Returns `204`.
`409` if the session isn't `IN_PROGRESS`.

## `POST /stock-counts/:id/complete`

Requires auth **and** `OWNER`/`MANAGER`. Body: `{ approval?: {
authorizedById, authorizedByName, reason } }`. Sums `|varianceValue|` across
every line with a non-zero variance. **Without** `approval`: `409` with
`{ totalVarianceValue, threshold }` if that sum exceeds
`warehouse.countVarianceApprovalThreshold` (default 5000) — nothing is
written. **With** `approval`: proceeds regardless.

On success: one transaction creates a `StockAdjustment` per variance line
(`adjustmentNumber` `ADJ-YYMM-NNNN`, `reason: "Stock count {countNumber}"`),
sets `item.currentStockQty = countedQty` for each, writes a `StockMovement`
(`ADJUSTMENT`) per line, marks the session `COMPLETED` with rollup totals,
`AuditLog` row. Returns `{ itemsCounted, itemsWithVariance }`.

Errors: `404` unknown session, `409` not `IN_PROGRESS` / variance threshold
block (see above).

### Reports — rebuilt to match a client-supplied "Part B" brief

Every report below was rebuilt, renamed, or newly built in one pass, replacing
the original Phase 8 set (see [07-progress.md](./07-progress.md) for the
phase writeup and why: the client's brief also proposed deleting Stock
Counts and restricting `MANAGER`'s report access — both explicitly declined,
so every report here is still `OWNER`/`MANAGER`, same as before). Each has an
on-screen page, a dedicated A4 print page at `/reports/<slug>/print` sharing
one letterhead component, a client-side PDF export
([`apps/web/lib/report-pdf.ts`](../apps/web/lib/report-pdf.ts), jsPDF +
autotable), and a client-side Excel export
([`apps/web/lib/report-excel.ts`](../apps/web/lib/report-excel.ts), SheetJS)
— both build the file in-browser and never upload anything.

## `GET /warehouse/letterhead`

Requires auth (any role). Returns `{ name, address, phone, ntn, logoUrl,
currency }` — the subset of `Warehouse` every report's printed/PDF header
needs. Backs [`components/reports/letterhead.tsx`](../apps/web/components/reports/letterhead.tsx),
used by every report below so they all share one letterhead instead of each
hand-rolling its own header.

## `GET /reports/profit-loss`

Requires auth **and** `OWNER`/`MANAGER`. Query: `?from=&to=` (default: this
calendar month). Renamed from `/reports/pnl`. Sales, COGS, and gross profit
boxed, then `losses` (spoiled + damaged returns + count shortages — via
`Wastage.groupBy(attributedTo)` and negative-`variance` `StockAdjustment`
rows, new this pass) and `expenses` (always `{ total: "0.00", tracked: false
}` — nothing in this system tracks overhead/petty-cash expense, so this is
shown honestly as untracked rather than a fabricated real zero), then
`netProfit` and a `per100` "for every PKR 100 of sales" breakdown. Still a
trading gross-margin report, not a full P&L. Returns `ProfitLossReport`
(shapes for every report below are in
[`apps/web/lib/types.ts`](../apps/web/lib/types.ts)). The brief that drove
this rebuild floated restricting this to `OWNER` only — the client explicitly
kept `MANAGER`'s existing access, so this is unchanged from before.

## `GET /reports/item-profitability`

Requires auth **and** `OWNER`/`MANAGER`. Query: `?from=&to=`. Merges the old
`margin-by-item` and `margin-erosion` reports into one. Same `IssueLine`
group-by as `margin-by-item`, now sorted by **profit contribution** (absolute
margin) descending rather than margin percent — the brief's own reasoning:
"the item making the most money is often not the item selling the most."
`marginWarnings` carries over `margin-erosion`'s live-state check (items
below their configured `marginFloorPercent` right now, not scoped to the
period), now with a `costChange` (from the most recent `PURCHASE_RECEIVED`
`StockMovement` in the last 30 days) and a `suggestedPrice`
(`avgCost / (1 - floorPercent/100)`, solved to land exactly on the floor).
`slowMoving` is new: stock on hand with zero sales in 30 days, with
`capitalTiedUp`. Returns `ItemProfitabilityReport`.

## `GET /reports/receivables-aging`

Requires auth **and** `OWNER`/`MANAGER`. No query params — always as-of now.
Renamed from `/reports/aging`; rebucketed from 5 buckets
(`current/d1_15/d16_30/d31_60/d60_plus`) to the brief's 4 (`current` = 0-7
days past due / `d8_15` / `d16_30` / `d30_plus`). Same
[`ageLedgerDebits`](../packages/logic/src/aging.ts) FIFO-consumption of the
customer's **whole** ledger as before (see
[07-progress.md](./07-progress.md) Phase 8 for why it has to be the whole
ledger, not just `Issue` rows). Adds `phone`, `overCreditLimit`
(`creditLimit > 0 && total > creditLimit`), a `needsAttention` block (anyone
with a `d30_plus` balance, with `oldestDays`), and `percentOfTotal` per
bucket. Returns `AgingReport`. `GET /customers/:id/ledger`'s own `aging`
field uses these same buckets and the same function, so the two reports never
disagree on what a customer owes.

## `GET /reports/daily-summary`

Requires auth **and** `OWNER`/`MANAGER`. Query: `?date=YYYY-MM-DD` (default
today). New this pass. One end-of-day screen: `sales`
(orders/gross/returns/net), `collections` (by payment method), `purchases`
(receipt count/total), `wastage` (lines + total), `orders` (every issue that
day with a Paid/Partial/Unpaid status). Deliberately has **no cash-drawer
reconciliation section** — nothing in this system tracks an opening float or
petty-cash expenses, so an "expected vs. counted cash" block would be
fabricated rather than real; omitted rather than shown as a fake zero.
Returns `DailySummary`.

## `GET /reports/stock-report`

Requires auth **and** `OWNER`/`MANAGER`. No query params — always current.
Renamed from `/reports/stock-valuation`. Same `stockQty × avgCost` as before,
now grouped by category with subtotals, plus a `status` per row (`OK` /
`LOW` / `OUT`) and an attention block: `outOfStock`, `lowStock`,
`expiringSoon`. **Bug fixed during this rebuild**: `expiringSoon` first
filtered `expiryDate: { lte: soon }` with no lower bound, which caught
already-expired lots too and miscategorized them as "expiring soon" instead
of already expired; fixed to `{ gte: now, lte: soon }` and verified against
the same expired test lot `GET /reports/expiry` flags. The brief's
CLERK-vs-OWNER column split (owner sees rate/value, clerk doesn't) isn't
built — this endpoint is `OWNER`/`MANAGER`-only like every other report, so
there's no clerk-facing version to trim columns from. Returns `StockReport`.

## `GET /reports/reorder-list`

Requires auth **and** `OWNER`/`MANAGER`. No query params — always current.
Renamed from `/reports/reorder-suggestions`; same trailing-21-day
usage/`daysOfCover` math (see [07-progress.md](./07-progress.md) Phase 8 for
the stockout-day bug fixed there — unchanged by this pass). Adds `urgency`
tiers (`urgent`/`soon`/`later`), `estimatedCost` per line, and a
`shoppingList` grouped by `item.preferredSupplierId` with a per-supplier
subtotal and a `grandTotal`. Returns `ReorderList`.

## `GET /reports/purchase-register`

Requires auth **and** `OWNER`/`MANAGER`. Query: `?from=&to=`. New this pass.
Chronological `GoodsReceipt` list with `bySupplier` totals and a
`priceChanges` section (consecutive `GoodsReceiptLine.unitCostSellUnit`
values per item, where they differ). Same honest gap as Daily Summary:
`GoodsReceipt.paidAmount`/`paymentMethod` exist as schema columns but have no
write path anywhere in this codebase, so nothing here claims to show what's
been paid to a supplier or what's still outstanding — that figure doesn't
exist yet. Returns `PurchaseRegister`.

## `GET /reports/wastage-report`

Requires auth **and** `OWNER`/`MANAGER`. Query: `?from=&to=`. New this pass —
Phase 8 only had the raw `/wastage` history list, no analytics. `byReason`
(with `percentOfTotal`), `byItem` (top losses, with `percentOfPurchases` via
a `GoodsReceiptLine.groupBy` over the same period), `dailyTrend`, and an
auto-generated one-line `observation` naming the item responsible for the
largest share of wastage. Returns `WastageAnalyticsReport`.

## `GET /reports/sales-by-customer`

Requires auth **and** `OWNER`/`MANAGER`. Query: `?from=&to=`. Renamed/rebuilt
from `/reports/customer-profitability`, which showed revenue/cost/margin —
this one deliberately doesn't, per the brief: margin has no place in a
customer-facing ranking. Per customer: `orders`/`sales` (gross issued amount)
from `Issue.groupBy`, `returns` from `ReturnNote.groupBy` (`createdAt` in
range — same convention as `profit-loss` and `daily-summary`; every
`ReturnNote` in this codebase is written `status: "ACCEPTED"` directly, there
being no draft/reject workflow wired up anywhere, so an unfiltered status
isn't a live bug), `net = sales - returns`, and `owes` (the customer's live
`currentBalance`, not scoped to the period — a balance is a snapshot, the
same figure Customer Statement and Receivables Aging show).
`overCreditLimit` mirrors `receivables-aging`'s own flag exactly. A
`returnRate` block ranks customers by `returns/sales`, flags the highest, and
reports a **sales-weighted** average (`Σreturns/Σsales`, not a mean of the
per-customer percentages) — checked against the brief's own worked example
to the decimal. Returns `SalesByCustomerReport`.

## `GET /reports/reconciliation`

Requires auth **and** `OWNER`/`MANAGER`. No query params. This **is** the
"nightly job" `SPEC.md` Part 6 requires — there's no scheduler in this stack
(see [06-decisions.md](./06-decisions.md)), so it's a plain, idempotent,
read-only endpoint meant to be called both from the Reports screen on demand
and from an external cron/scheduled-task once deployed. For every customer,
`expected = Σ(CustomerLedger.debit) - Σ(.credit)` compared against
`customer.currentBalance`; for every item, `expected = Σ(StockMovement.qty)`
compared against `item.currentStockQty`. Deliberately checks **every** row,
not just active/non-deleted ones. Returns `{ checkedAt,
customerMismatches: [{ customerId, name, stored, expected, delta }],
itemMismatches: [{ itemId, name, stored, expected, delta }] }` — both arrays
empty means everything reconciles; a non-empty array is a real, named defect
somewhere upstream, not something this endpoint fixes itself.

## `GET /reports/expiry`

Requires auth **and** `OWNER`/`MANAGER`. No query params. The other "daily
job" from the edge-cases doc, same non-scheduler treatment as reconciliation
above. For every active perishable item with `currentStockQty > 0`, finds
its oldest still-open `PurchaseLot` (`remainingQty > 0`) past `expiryDate`.
Flags the *item*, not a precise leftover quantity — `PurchaseLot.remainingQty`
isn't decremented as stock is issued (see
[07-progress.md](./07-progress.md#phase-5--printing--done)'s picking-slip
note), so this is a prompt to check physically and log wastage, not an
automatic write. Returns `{ items: [{ itemId, name, stockQty, unitCode,
oldestExpiredBatch, expiredOn, daysExpired }] }`, most-overdue first.

## `GET /warehouse`, `PATCH /warehouse`

`GET` requires auth **and** `OWNER`/`MANAGER`; `PATCH` requires `OWNER`
specifically — these are business-critical thresholds, one step more
restricted than the usual `OWNER`/`MANAGER` split. Body (all optional):
`{ wastageApprovalThreshold, countVarianceApprovalThreshold,
periodLockedBefore }` — the last is a date string or `null` to clear it.
Presented at `/settings`. Every `PATCH` writes an `AuditLog` row with the
full before/after.

## Not built yet

Purchase orders (goods receipt itself is done), manual-payment-allocation UI
and cash refunds (the `POST /payments` and schema support both; no screen for
either), a "Supplier Balances" report (would need
`GoodsReceipt.paidAmount` to actually be written somewhere first — see
`purchase-register` above), and the Collections/Stock Consumption/Price
Trend/Supplier Comparison/Purchasing Variance reports (`SPEC.md` Part 9's
remaining report types — see [07-progress.md](./07-progress.md) for why).
