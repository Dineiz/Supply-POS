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

## Open — needs an ADR before it's added

Nothing yet. BullMQ / Socket.IO / Redis remain explicitly out of scope per
`SPEC.md` Part 13 until a real need is demonstrated and written up here.
