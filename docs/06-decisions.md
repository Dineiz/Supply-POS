# Decisions (ADRs)

## ADR-001: decimal.js for all money and quantity math

**Decision:** every field that is money or a stock quantity is Postgres
`DECIMAL` via Prisma's `Decimal` type, and `packages/logic` does all
arithmetic on `decimal.js` values, never `number`.

**Why:** this system's entire value proposition is "every rupee traceable."
IEEE754 floats accumulate rounding error across thousands of moving-average
recalculations and ledger entries; a nightly reconciliation job (Phase 9)
compares computed balances against stored denormalised ones, and float drift
would produce false-positive anomalies (or worse, mask real ones). Prisma's
generated client already represents `Decimal` columns using `decimal.js`
internally, so using the same library in `packages/logic` means values
round-trip losslessly between the database and the pure functions — no
extra dependency weight, no conversion layer.

**Precision chosen:** quantities `DECIMAL(14,4)` (fractional kg/L need more
than 2dp to avoid compounding rounding on repeated averaging); money
`DECIMAL(14,2)` (paisa); percentages `DECIMAL(5,2)` (variance fields that can
exceed 100% use `DECIMAL(6,2)`).

**Alternative rejected:** integer minor-units (paisa as an integer), the
other common fix for float money bugs. Rejected because quantities need
fractional precision too (12.5kg), and this system already has a unit
conversion layer (`purchaseToSellFactor`) — stacking an integer-scaling
scheme on top of that would be two competing precision systems for no real
gain over `Decimal`.

## ADR-002: pnpm workspaces, no Turborepo, no monorepo build tool

**Decision:** `pnpm-workspace.yaml` only. No Turborepo, Nx, or similar.

**Why:** two apps and two internal packages, consumed as TS source (no
build step for `packages/logic`/`packages/db` during dev). A build
orchestrator earns its cost when there are many packages with real build
graphs and caching pain — not here. Matches the spec's own principle: don't
add infrastructure until the product demands it. Revisit if `packages/*`
grows enough that `pnpm -r` build times become the bottleneck.

## ADR-003: hand-written app scaffolds, not `create-next-app`

**Decision:** `apps/web` and `apps/api` were hand-written rather than
generated with `create-next-app`/a Fastify starter.

**Why:** full control over exactly what's included (no default ESLint
config, no Turbopack experimental flags, no unused boilerplate) and no
dependency on an interactive scaffolding prompt succeeding non-interactively
in a sandboxed shell. The two scaffolds are small enough that hand-writing
was faster and more predictable than fighting generator flags.

## ADR-004: Prisma's generic `refType`/`refId` kept, but typed FKs added alongside on `customer_ledger`

**Decision:** `CustomerLedger` keeps the spec's generic `refType`/`refId`
string pair (useful for audit display: "here's the ref, go look it up") but
*also* gets three real, typed, optional foreign keys — `issueId`,
`returnNoteId`, `paymentId`.

**Why:** Prisma has no true polymorphic-relation feature. A generic
`refType`/`refId` pair alone means every join back to the source document
has to be done in application code with a manual switch on `refType`. Real
FKs give referential integrity and let Prisma's query API join directly.
Keeping the generic pair too costs two nullable columns and preserves the
spec's original audit-friendly shape.

## ADR-005: `cuid()` for all primary keys

**Decision:** every model's `id` is `String @id @default(cuid())`.

**Why:** sortable-ish, collision-safe, generated without a round-trip to the
database (unlike serial ints), and avoids leaking row counts (a competitor
scraping sequential issue IDs could estimate transaction volume). Standard
Prisma default; no reason to deviate.

## ADR-006: Non-interactive migrations — write migrations deterministically

**Decision:** when a schema change is needed, edit `schema.prisma`, then
hand-write or generate the migration folder (`prisma/migrations/<timestamp>_<name>/migration.sql`,
timestamp format `YYYYMMDDHHMMSS` matching existing folders) and apply it
with `prisma migrate deploy` (non-interactive). Never reach for
`migrate reset` to "start clean" — see below.

**Why:** `prisma migrate dev` requires an interactive TTY,
regardless of piped stdin — this is a Prisma constraint in non-interactive CI/CD and scripted environments. Separately, `prisma migrate reset`
destructively drops database tables, which is unsafe for production data and automated pipelines. `migrate deploy` has neither restriction and is
exactly what's meant for scripted/CI application of already-written
migrations, so it's the correct tool here regardless.

**How to apply:** for any future schema change, prefer fixing forward with a
new migration file over resetting. Keep migrations deterministic and forward-only.

## ADR-007: design system built from the real Dineiz brand assets, not invented

**Decision:** `apps/web`'s Tailwind theme (`apps/web/app/globals.css`) uses
colors pulled from `Dineiz-assets/` rather than a made-up palette: near-black
ink / white paper / warm-gray neutrals as the base, and `#f3562c` as the one
accent color. The actual logo SVGs (`Dineiz-assets/transparent/...`, the
versions with no baked-in background rect) are copied into
`apps/web/public/brand/` and rendered by a small `<Logo>` component — never
recreated as a lookalike.

**Why:** initially it looked like the core Dineiz wordmark was pure
black/white and `#f3562c` only belonged to the "Dineiz Go" sub-brand
(`grep`-ing SVG `fill=` attributes only found black/white on the main
logo). That was incomplete — the main logo's icon mark is a *raster* image
embedded via an SVG mask (not a vector `fill`), and inspecting
`dineiz-app-icon.png` directly shows the "D" icon itself is the same
orange. So `#f3562c` is the core brand's own accent, confirmed by looking at
actual pixels, not assumed. Lesson for next time: grepping vector fills in a
brand SVG can miss a raster-embedded mark's real color — check the flattened
PNG too.

**Non-transparent vs. transparent asset variants:** `Dineiz-assets/logos/*`
bakes in a solid white or black background rectangle (meant for standalone
use, e.g. an avatar tile); `Dineiz-assets/transparent/logos/*` has no
background and is what a UI header/footer needs so the mark sits on
whatever's behind it. Grep for `fill="#ffffff"`/`fill="#000000"` covering
the whole canvas, or a `<rect>` spanning the viewBox, is how to tell them
apart before using one in a page.

## ADR-008: `(dashboard)` route group for management screens, counter screen stays standalone

**Decision:** `/items` and `/customers` (and future master-data screens)
live under `apps/web/app/(dashboard)/`, sharing a layout with a sidebar
(logo, nav, user, sign out) and a role gate that redirects CLERK/VIEWER to
`/counter`. `/counter` itself stays a top-level route with its own minimal
header — it does **not** get the sidebar.

**Why:** the spec is explicit that the counter screen is "one screen, one
job... no tabs, no side panels" (Part 12) — a clerk standing at a busy
counter shouldn't see navigation to screens they can't use anyway. Owners
and managers, doing data entry rather than serving a queue, benefit from
persistent navigation. A Next.js route group (`(dashboard)`) gives the
shared chrome without adding a URL segment (`/items`, not
`/dashboard/items`).

**Logo sizing:** the sign-in screen's logo is the largest (`h-16`, the
brand's one moment to be a hero); the dashboard sidebar and counter header
use smaller, fixed sizes (`h-9` / `h-8`) appropriate for persistent chrome.
If it reads as too small again, check the *actual rendered pixel height*
against the container it sits in, not just the Tailwind class — the brand
SVGs' `viewBox` is already tightly cropped to content (see ADR-007), so
sizing is purely the `className` height now, nothing hidden in the asset.

## ADR-009: order detail pages, "Today"-first lists and reports, and warehouse-timezone days

**Status:** Accepted · **Date:** 2026-10-16 · **Deciders:** owner (client feedback), engineering

### Context

Client feedback after go-live: on the Deliveries, Receiving and Returns tabs,
clicking a row does nothing, so an operator cannot see what was sent or
received, which items, or whether it was paid. Reports only offer two raw date
boxes; the client wants *one day, 7 days, or custom* for everything bought and
sold. And "some tabs open on all dates, some on custom, none on today".

Auditing the code found four separate causes, not one:

1. **No detail view exists.** `GET /goods-receipts/:id` is built but nothing
   calls it; the `/issues`, `/returns` and `/payments` rows are plain `<tr>`s.
   The list endpoints return line *counts*, never lines or payment state.
2. **Every list page starts at `useState<DateRange | null>(null)`**, i.e. "All
   dates". Worse, `DatePresetFilter` kept `activePreset` in its own state that
   starts `null`, so even a page that *did* pass today's range would label it a
   raw date ("17 Oct") instead of "Today" — the "shows custom, not today" symptom.
3. **Two contradicting day rules.** List endpoints (`parseListQuery`) read
   `from`/`to` as the *server's local* day (no `Z`). Report endpoints
   (`parseDateRange`, `daily-summary`) read them as *UTC* days, and the report
   pages compute "today" with `toISOString()` (UTC). On a UTC host serving a
   UTC+5 business, anything sold between midnight and 05:00 local lands on the
   wrong day, and the browser's "today" is *yesterday* for those hours.
   `Warehouse.timezone` (default `Asia/Karachi`) exists in the schema and is read
   nowhere.
4. **Payment state is invisible and, for suppliers, never recorded.**
   `GoodsReceipt.paidAmount` has no write path anywhere (documented in Purchase
   History and Daily Summary), so "is it paid?" cannot be answered for receiving.
   For deliveries it *can* be: non-reversed `PaymentAllocation`s are the canonical
   "paid" figure (`getOutstandingIssues`), but only the Daily Summary surfaces it.

### Decision

1. **One period control, one default.** `DatePresetFilter` becomes the only date
   control for lists *and* reports: Today · Yesterday · Last 7 days · This month ·
   Custom range (· All dates, lists only). Its label is **derived from the value**,
   never from click history. Every screen opens on **Today**. The chosen range is
   spelled out next to the control and the empty state offers Last 7 days / All dates.
2. **Detail pages, not drawers:** `/issues/[id]`, `/receiving/[id]`,
   `/returns/[id]`, `/payments/[id]`. The whole row is the click target. Each page
   shows header facts, every line (qty × rate = amount), the money summary, who did
   it, and links to related documents (delivery ↔ its payments and returns;
   payment → the deliveries it settled; return → the original delivery).
3. **Payment state is computed once** (pure rule in
   `packages/logic/src/payment-status.ts`, loaded per page by
   `apps/api/src/lib/issue-money.ts`): `paid` = Σ non-reversed allocations;
   `returned` = Σ return credit linked to the delivery;
   `due = max(0, total − returned − paid)`; status = Paid / Part paid / Unpaid.
   Lists, details, Sales History and Daily Summary all use it, so they cannot disagree.
4. **Calendar days are warehouse-timezone days, resolved on the server.** Clients
   send `YYYY-MM-DD`; `packages/logic/src/date-range.ts` (pure, unit-tested) turns
   that into the UTC instants of local 00:00 and 23:59:59.999 in
   `Warehouse.timezone`, DST-safe via `Intl`. One rule replaces the two. Report
   day-bucketing uses the same zone.
5. **Reports:** every period report gets the shared control and defaults to Today.
   *Daily Summary* accepts a period (`from`/`to`; `date` still works) and adds a
   by-day table for multi-day ranges. New *Sales History* (every delivery with
   paid/left, an items-sold table, and a line-level Excel sheet) is the missing
   mirror of *Purchase History*, which gains an items-bought table and payment
   columns. Both open each document in its detail page.
6. **Supplier payment is captured minimally.** `POST /goods-receipts` accepts an
   optional `paidAmount` + `paymentMethod` ("paid now"), and a new
   `POST /goods-receipts/:id/payments` settles later. These write the existing
   `GoodsReceipt.paidAmount` / `paymentMethod` columns — **no migration, no
   payables ledger** (still `SPEC.md` Part 0 question 5, deferred). Receipts
   recorded before this change read "No payment recorded", not "Unpaid", because
   history never captured it.

### Options considered

**Detail UI** — (A) slide-over drawer on the list; (B) **dedicated route**;
(C) inline expanding rows.

| Dimension | A. Drawer | B. Route (chosen) | C. Inline rows |
|---|---|---|---|
| Linkable / refresh-safe / printable | No | **Yes** | No |
| Reports can deep-link into it | No | **Yes** | No |
| Matches existing code | New pattern | **`customers/[id]`, `items/[id]`, `stock-counts/[id]`** | New pattern |
| Room for lines + payments + related docs | Cramped on a phone | **Full page** | Pushes the list around |

**Day boundaries** — (A) server `?preset=today`; (B) **client sends calendar
days, server resolves them in the warehouse timezone**; (C) client sends UTC
instants. B keeps URLs and inputs human-readable (`2026-10-16`), keeps custom
ranges and presets on one code path, and leaves timezone authority with the one
component that has the schema. A forks presets from custom ranges. C leaks the
browser's timezone into the data and breaks when a manager opens the app from a
laptop set to another zone.

**Supplier payment** — (A) leave it "not tracked" and say so; (B) **minimal
paid-now + settle-later on existing columns**; (C) full payables ledger. A fails
the client's literal question ("is the payment done?"). C is a feature the spec
explicitly deferred. B answers the question with zero schema change and is easy
to remove.

### Trade-offs

- Whole-row click plus a real link in the number cell: slightly more markup, but
  keyboard, screen-reader and middle-click all work.
- `due` nets out returns, matching what the customer actually owes on the ledger,
  but `getOutstandingIssues` (payment auto-allocation) still ignores returns — a
  pre-existing quirk. A payment can therefore be allocated "past" a returned
  delivery's net, and a row's "left" can differ from the ledger by that amount.
  Period totals strips use the ledger-consistent aggregate. **Not changed here**
  (it alters money allocation); logged in `05-edge-cases.md` to revisit.
- Supplier "settle later" keeps a running `paidAmount` plus an audit-log entry per
  payment, not a payments table.

### Consequences

- Easier: answering "what did we send / receive / take back, and is it settled?"
  in one click; one place to change date behaviour; reports agree with lists.
- Harder: nothing structural. List endpoints now return a little more (paid/due
  per row, period totals).
- Revisit: returns-aware auto-allocation; a real supplier payables ledger;
  whether report pages should remember the last period (deliberately **not**
  done — "opens on Today" is the rule).

### Action items

1. [x] Vault note (this ADR)
2. [x] `packages/logic/src/date-range.ts` + tests
3. [x] API: tz-aware range parsing, payment-status helper, list summaries, detail endpoints, supplier payment
4. [x] Web: period control, four list tabs, four detail pages, receiving "paid now"
5. [x] Reports: shared control, Summary with period, Sales History, Purchase History items
6. [x] Update `04-flows`, `05-edge-cases`, `07-progress`, `08-api`, `00-index`
7. [ ] Later: returns-aware payment allocation; supplier payables ledger

## Open — needs an ADR before it's added

Nothing yet. BullMQ / Socket.IO / Redis remain explicitly out of scope per
`SPEC.md` Part 13 until a real need is demonstrated and written up here.
