# Dineiz Supply — Specification

Source of truth for this repository. Read this completely before writing code.
This is a separate product from the Dineiz POS monorepo: separate repo,
separate deployment, separate database. Nothing is shared between them except
design language (copied in, not imported).

---

## Part 1 — What this business actually is

The client is not running an inventory system. They are running a wholesale
distribution business with credit terms and returns.

```
Market/Supplier  →  Warehouse  →  Restaurant kitchens
   buy at 10        hold stock      sell at 12
                                    often on credit
                                    sometimes returned
```

Three things make this genuinely hard, and they are the three things most
inventory software gets wrong:

1. **The same item has many purchase prices.** Sugar bought Monday at
   PKR 140/kg and Thursday at PKR 152/kg both sit in the same sack. When you
   issue 5kg, which cost applies? Get this wrong and every profit number in
   the system is fiction.
2. **Returns are not returns — they are reconciliation.** A restaurant takes
   5kg, uses 3kg, brings back 2kg. That is not a refund. It is an adjustment
   to an outstanding balance that may or may not have been paid yet.
3. **Credit is the default, not the exception.** Payment happens whenever,
   partially, in cash, often against a different day's bill. The ledger is
   the real product here, not the stock count.

## Part 2 — Monorepo or separate?

Separate repository, separate deployment, separate database.

```
dineiz-pos/        existing monorepo — untouched
dineiz-supply/     this repository
```

The POS monorepo carries Prisma with 40+ models, BullMQ, Socket.IO, WhatsApp,
aggregators, and a Python forecast service. Adding Supply to it means every
deploy of either product rebuilds and redeploys both, a schema migration for
one risks the other, and the POS API's memory footprint grows for a feature
its users never touch. Supply is a different product for a different
customer with a different data model and no shared entity with a restaurant
tenant. What's shared is copied in: design tokens, UI components, the receipt
formatting approach.

## Part 0 — Assumptions (decided, override any of them)

| Question | Decision | Why |
|---|---|---|
| Pricing model | Per-item base selling price, with optional per-restaurant override | Covers "sugar is always 160" and "this restaurant gets a better rate" without forcing a choice now |
| Credit limits | Soft limit per restaurant. Warning at 80%, block at 100% with manager override | A hard block would stop business at the counter |
| Scale | 50 restaurants, 2,000 items, 500 issue slips/day | ~20x likely current volume; costs nothing extra to design for |
| Units | Buy unit and sell unit are separate, with a conversion factor | Buy a 50kg sack, sell by the kg — essential, non-negotiable |
| Users | Warehouse clerk, warehouse manager, owner. Restaurant managers get read-only access later | Restaurant login is optional, Phase 2+ |
| Costing | Weighted average moving cost, purchase lots tracked separately for expiry/price history | See Part 3 |

Still to confirm with the client (does not block Phase 1):
1. Is selling price truly per-item, or does it vary a lot per restaurant?
2. Do restaurants get logins to see their own balance?
3. Do they use rack locations in the warehouse (improves the picking slip)?
4. Who counts stock, and how often — single person or multi-user sessions?
5. Do they buy from suppliers on credit too? (Would need a payables ledger
   mirroring the receivables one — left out of this spec, would be Phase 10.)

## Part 3 — The costing engine

This is the heart of the system. Everything else is data entry.

**The problem:**

```
Monday   bought 50 kg sugar @ PKR 140  =  7,000
Thursday bought 30 kg sugar @ PKR 152  =  4,560

One sack. 80 kg. Two prices.
Restaurant takes 5 kg on Friday. What did those 5 kg cost?
```

Three possible answers: **FIFO** (accurate, but nobody is physically drawing
from discrete layers — the sugar is mixed in one sack), **specific lot**
(most accurate, impractical at a busy counter), or **weighted average moving
cost** (one pool, one current cost).

**Decision: weighted average moving cost.**

1. It matches physical reality — the sugar is mixed in one sack.
2. A warehouse clerk can understand "your sugar currently costs 144.50/kg."
3. It self-corrects — total COGS over a month equals FIFO's; only individual
   transactions vary slightly.
4. It is fast — one row update per receipt, no layer walking on issue.

Purchase lots are still recorded as permanent rows, not for costing but for
**expiry tracking**, **price history**, **supplier performance**, and
**traceability**. Hybrid: simple costing, full audit history.

**The exact formula.** On every receipt:

```
newQty        = currentQty + receivedQty
newTotalValue = (currentQty × currentAvgCost) + (receivedQty × receiptUnitCost)
newAvgCost    = newTotalValue / newQty

Guard: if currentQty <= 0, do not blend — the average resets to the
       receipt cost exactly. Blending a negative or empty position with
       a real cost produces a meaningless number.
```

On every issue:

```
costOfGoods = issuedQty × currentAvgCost
```

This is **frozen forever** on the issue line. Never recomputed from a moved
average — otherwise last month's P&L would change every time you buy sugar
today.

**Margin erosion.** Selling price can stay flat while purchase cost rises
mid-week (a stockout forces a same-week re-buy at a higher price). The system
must surface this — a Margin Erosion report, and an alert when an item's
margin falls below a configurable floor (`marginFloorPercent`).

## Part 4 — Returns and compensation

Never edit a closed document. Never delete an invoice. Every movement is a
new, immutable entry in a ledger (a running account, not invoice-by-invoice
settlement).

```
LEDGER — Al-Madina Restaurant
Date   Type              Ref        Debit   Credit   Balance
12/09  Issue             ISS-0041     800              800
13/09  Return credit     RTN-0012             320      480
13/09  Issue             ISS-0048   1,080            1,560
13/09  Payment (cash)    PAY-0033           1,000      560
                                    Outstanding:        560
```

**Return credit valuation:** at the price the customer was charged, not at
cost (`credit = returnedQty × originalUnitPrice`). Cost reversal is a
separate, warehouse-side calculation (`returnedQty × originalUnitCost`).

**Return condition** — the critical field, picked by the clerk, default GOOD:

| Condition | Stock effect | Cost effect |
|---|---|---|
| GOOD | Returns to sellable stock at the cost it was issued at | Cost reversed to inventory value |
| DAMAGED | Does NOT return to stock | Cost becomes a warehouse loss |
| EXPIRED | Does NOT return to stock | Cost becomes a warehouse loss |
| WRONG_ITEM | Returns to sellable stock | Cost reversed normally |

**Perishable rule:** if `item.isPerishable` and hours since issue exceeds
`item.returnWindowHours` (default 12), condition is **forced to DAMAGED**.
The customer still gets their credit (goodwill); the warehouse absorbs the
cost. Prevents rotten stock re-entering inventory.

**Compensation in kind** (return this, take that instead) is just two
ordinary entries — a return credit and a new issue. No special "swap" type.

## Part 5 — Payments and credit

Running account, not invoice matching. Payments allocate to the **oldest
outstanding invoices first**, automatically, with a manual override behind
an "Advanced" toggle for the rare specific-invoice request.

```
Al-Madina Restaurant · Outstanding: PKR 2,950
Amount received [2,000] → ISS-0041 (800, fully paid), ISS-0048 (1,200, fully
paid), ISS-0052 (950, 0 applied) → After this payment: PKR 950
```

**Credit limits per restaurant:** `creditLimit`, `creditDays`. Balance + this
order ≤ 80% of limit → proceed silently. 80–100% → amber warning, proceed.
Over 100% → red block, **manager PIN overrides — always**, logged with who
and why. Software must never be the reason a warehouse refuses a sale.

**Aging report:** current / 1-15d / 16-30d / 31-60d / 60d+ buckets per
customer. The 60d+ column is the single most useful report for the owner.

## Part 6 — Database schema

See [`packages/db/prisma/schema.prisma`](./packages/db/prisma/schema.prisma)
for the authoritative, implemented schema, and
[`docs/03-schema.md`](./docs/03-schema.md) for the rationale behind every
table. Design non-negotiables carried into the schema:

- **Every quantity is stored in sell units.** A 50kg bag is received as 50
  units of KG. Conversion happens once, at receiving, never again.
- **`stock_movement` is append-only** and is the audit trail. Nothing may
  change stock without writing a row here, in the same transaction.
- **`customer.currentBalance` and `item.currentStockQty` are denormalised**,
  maintained in the same transaction as every ledger/movement write, verified
  against the ledger/movement sum by a nightly job — never computed by
  aggregating on read.
- **Names, unit codes, prices, and costs are frozen onto line items** at the
  time of the transaction (`issue_line.itemName`, `.unitCost`, etc.) so a
  renamed or repriced item never rewrites history.
- **`audit_log` is append-only.** No delete endpoint exists, ever.
- **Every table carries `warehouseId`** for multi-warehouse from day one,
  even with a single warehouse today.

## Part 7 — The counter screen

The screen that determines whether the product succeeds. Target: 30 items
issued in under 90 seconds, including printing.

**Performance strategy, not an optimisation exercise:**

1. The full catalogue (items, categories, units, customers) loads into memory
   once at login — roughly 600KB for 2,000 items. Trivial.
2. Every tap reads from memory. Zero network calls per tap.
3. The whole order builds client-side.
4. **Exactly one network request** happens: the `POST` when "Issue & Print"
   is tapped.

**Interactions:** tap adds qty 1 (no modal); tap again increments; long-press
opens a numeric pad for a specific quantity; search filters the in-memory
catalogue; a barcode scanner (emulating a keyboard) adds instantly. Never
hard-block on out-of-stock or over-credit — always allow a manager-PIN
override, always log it.

## Part 8 — The printed receipt

Two documents print together: the **Delivery Note** (customer-facing — full
item detail, and an "Account Summary" block that is the visually dominant
section, since "how much do I owe now" is the manager's first question), and
the **Picking Slip** (warehouse-facing — no prices, large bold quantities,
rack location if configured, expiry guidance from `purchase_lot` data: "issue
oldest crate first"). Reprints are marked `*** REPRINT — COPY n ***` and
increment `issue.printCount`.

## Part 9 — Reports

Two tiers, deliberately separated: **clerk reports** (Daily tab — simple,
one-tap, no date pickers) and **owner reports** (Financial: P&L, Margin by
Item, Margin Erosion, Receivables Aging, Collections; Stock: Valuation,
Consumption, Reorder Suggestions, Expiry, Wastage; Purchasing: Price Trend,
Supplier Comparison, Variance; Customer: Statement, Profitability, Credit
Utilisation).

**Reorder suggestion logic:** average daily usage over the trailing 21 days,
**excluding stockout days** (a day with zero stock is not zero demand — 
including it drags the average down and causes chronic under-ordering).
`daysOfCover = currentStockQty / avgDailyUsage`; suggest reordering when
`daysOfCover < item.reorderDays`, rounded up to a whole purchase unit.

## Part 10 — Edge cases

The full catalogue of costing, issue, return, payment, stock/wastage, and
operational edge cases (negative-stock resets, credit overrides, perishable
return windows, idempotent double-submits, cheque bounces, etc.) is
maintained in [`docs/05-edge-cases.md`](./docs/05-edge-cases.md) — read that
file for the authoritative, up-to-date list and implementation status.

## Part 11 — Architecture and hosting

```
apps/
  web/       Next.js 15 App Router — the whole UI
  api/       Fastify — REST only, no Socket.IO at launch
packages/
  db/        Prisma schema and migrations
  logic/     Pure functions: costing, pricing, totals, allocation.
             Zero I/O. Unit tested. Shared by api and web.
```

No BullMQ, no Socket.IO, no Redis at launch — none of this data volume (order
of 500 transactions/day, ~220k rows/year) needs a job queue or realtime
layer. Two devices in one warehouse can poll every 30 seconds; add realtime
later only if it proves necessary. **Every piece of infrastructure added is a
thing that can break at 6am — add none of it until the product demands it.**

Sizing: Postgres + a small API instance is genuinely a **$10–17/month**
application at this volume (Railway/Render/Neon + Vercel free tier). The
"$200 machine" fear only shows up if this were coupled into the POS monorepo.

## Part 12 — UI/UX principles

Numbers are the interface (large, monospace, right-aligned, thousands
separators — never `3180.00`, never `Rs.3180`). One screen, one job. Urdu
support wherever it helps (item names, receipts). No jargon ("what they owe,"
not "accounts receivable"). Confirm only what is irreversible — adding an
item needs no confirmation, cancelling an issue needs a reason. Touch-first,
44px minimum targets. Nothing looks generated — no gradients, no emoji in the
UI, restrained type scale, one accent colour.

## Part 13 — What not to do

Do not import anything from the Dineiz POS repository. Do not add BullMQ,
Socket.IO, or Redis without an ADR in `docs/06-decisions.md` and explicit
approval. Do not build features outside this spec. Do not skip the vault —
stale docs are a failed task. Do not hard-block any warehouse operation;
always allow a logged manager override. Do not compute balances or stock by
aggregating on read. Do not let a monetary value display with the wrong
precision.
