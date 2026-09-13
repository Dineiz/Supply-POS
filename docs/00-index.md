# Dineiz Supply — Vault Index

Project vault for Dineiz Supply. This is separate from the Dineiz POS vault —
nothing in this repo shares data or code with that product. Read
[`../SPEC.md`](../SPEC.md) first; it is the source of truth this vault
explains and tracks against.

## Contents

| File | What's in it |
|---|---|
| [01-architecture.md](./01-architecture.md) | Stack, folder structure, data flow, why nothing is shared with the POS monorepo |
| [02-costing-engine.md](./02-costing-engine.md) | The weighted-average costing logic, worked numerical examples matching the test suite |
| [03-schema.md](./03-schema.md) | Every Prisma model, every field, why it exists |
| [04-flows.md](./04-flows.md) | Issue, return, payment, receiving — step by step, transaction boundaries |
| [05-edge-cases.md](./05-edge-cases.md) | Every edge case from the spec, plus ones discovered while building, with implementation status |
| [06-decisions.md](./06-decisions.md) | ADRs — every non-obvious choice, the alternatives, the reason |
| [07-progress.md](./07-progress.md) | Current phase, what's done, what's next, what's blocked |
| [08-api.md](./08-api.md) | Every endpoint: request, response, errors |
| [09-testing.md](./09-testing.md) | What to verify after each phase, and how |
| [10-deployment.md](./10-deployment.md) | Docker images, required env vars, migrations, smoke test, pre-launch checklist |

## Current state

**All 9 phases of the original build plan are done, plus a Phase 10 reports
rebuild** (Phase 3's purchase orders are still not started; the report set
is still the high-value subset of `SPEC.md` Part 9, not all sixteen — see
below). All verified in the browser, not just written:

- Login (password + clerk PIN), a dashboard shell (sidebar nav, role-gated
  to OWNER/MANAGER) with items, customers, receiving, returns, payments,
  wastage, stock-count history, reports, and settings.
- The counter screen: tap-to-cart issue creation (stock, ledger, balance,
  idempotency, credit/stock override all correct), plus **Payment** and
  **Return** modals reachable by any role (matching `SPEC.md`'s own counter
  mockup) — oldest-first payment allocation with a live preview, and
  return handling that freezes original pricing, forces perishable returns
  outside the window to `DAMAGED`, and writes the cost off as `Wastage`
  rather than restoring stock.
- Goods receipt with a live per-line cost-variance warning, a confirmation
  modal on submit, and the exact weighted-average worked example from
  `SPEC.md` reproduced through the real UI.
- Payment reversal (bounced cheque / wrong customer), verified including
  the double-reversal block.
- The printed Delivery Note and Picking Slip for an issue — every element
  from the spec's own detailed mockup, at real 80mm thermal sizing, with
  live data (account summary, credit info, oldest-unpaid nudge, rack
  location, perishable "issue oldest crate first" guidance) and correct
  reprint marking. The counter screen's button is now honestly labelled
  "Issue & Print" — it wasn't, until this actually worked.
- Wastage logging and stock counts (full/by-category/spot), both with a
  manager-override approval flow above a configurable cost/variance
  threshold — the same override pattern used for credit-limit and
  stock-shortage blocks elsewhere, reused rather than reinvented.
- Units/categories/suppliers CRUD under a `/setup` hub (delete guarded
  behind reference checks for units/categories, soft-deactivate for
  suppliers) — items and customers had this since Phase 2, master data now
  does too.
- Ten reports under `/reports`, grouped Daily / Money / Stock / Purchases /
  Customers: Daily Summary, Customer Statement, Receivables Aging,
  Profit & Loss, Item Profitability, Stock Report, Reorder List, Wastage
  Report, Purchase Register, Sales by Customer. Rebuilt in Phase 10 to match
  a client-supplied report spec exactly (renamed, merged, and added reports;
  see [07-progress.md](./07-progress.md#phase-10--reports-rebuild-and-reports-hub--done)) —
  every report now has an on-screen view, an A4 print layout on a shared
  letterhead, a PDF download, and an Excel download, none of which existed
  before Phase 10. Two real bugs were found and fixed while rebuilding these:
  Customer Statement's closing balance trusted a ledger row's stored
  `balanceAfter` instead of recomputing a running total, which a backdated
  entry could throw off; Stock Report's "expiring soon" filter had no lower
  bound and was catching already-expired stock. Two earlier Phase 8 bugs
  (aging missing non-`Issue` balances, reorder excluding real sales on a
  zero-stock day) remain fixed and carried forward unchanged.

- Hardening (Phase 9): a reconciliation report that checks every customer
  balance and item stock quantity against a from-scratch sum of its own
  ledger/movement history — verified by deliberately corrupting both kinds
  of value directly in Postgres and confirming the report caught each one
  exactly, then reverted. An expiry report flagging perishable items with
  a batch past its expiry date. A month-end period lock
  (`Warehouse.periodLockedBefore`) blocking a backdated payment without a
  manager override — the same override pattern used everywhere else in
  this system. None of this runs on an automatic schedule: this stack
  deliberately has no job queue (`SPEC.md` Part 11), so both "jobs" are
  on-demand endpoints meant to be polled by an external cron once deployed,
  not something running silently in the background today.

Not started: purchase orders, the remaining Part 9 report types (Collections,
Stock Consumption, Price Trend, Supplier Comparison, Purchasing Variance,
plus a "Supplier Balances" report that needs `GoodsReceipt.paidAmount` to
actually be written somewhere first), a counter-screen expiry warning tile,
table pagination for large datasets, and broader UI polish beyond the
Phase 10 logo fix. See [07-progress.md](./07-progress.md) for the exact,
current per-phase checklist — it is kept accurate, not aspirational.

## Working rules for development

- Update this vault **before** writing code for a feature, and **again**
  after it works. A stale vault is a failed task, regardless of whether the
  code runs.
- Maximum ~3 files changed per response/commit where practical; one concern
  at a time.
- Never import from `dineiz-pos`. Never add BullMQ / Socket.IO / Redis
  without an ADR in [06-decisions.md](./06-decisions.md) and explicit
  sign-off first.
- Money and quantity fields are `Decimal` end to end (Postgres `DECIMAL` via
  Prisma, `decimal.js` in `packages/logic`) — never `number`/`Float` for
  anything that touches the ledger or stock qty. See
  [ADR-001](./06-decisions.md#adr-001-decimaljs-for-all-money-and-quantity-math).
