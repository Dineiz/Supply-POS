# Architecture

## Why a separate repo

See [`SPEC.md` Part 2](../SPEC.md#part-2--monorepo-or-separate). Short
version: the POS monorepo's weight (40+ Prisma models, BullMQ, Socket.IO,
WhatsApp, aggregators, a Python forecast service) is not this product's
weight. Coupling them means every deploy of either rebuilds both, and a
migration for one risks the other. Supply shares design language with POS
(copied in), not code or data.

## Stack

```
apps/
  web/       Next.js 15, App Router, TypeScript, Tailwind v4
  api/       Fastify 5, TypeScript, ESM
packages/
  db/        Prisma 6 schema + migrations + a client singleton
  logic/     Pure functions (costing, pricing, allocation, reorder math).
             No I/O, no framework — imports only `decimal.js`. Unit tested
             with Vitest. Consumed as TS source by both apps (no build step
             for internal packages during dev).
docs/        This vault.
```

Workspace tool: **pnpm workspaces** (`pnpm-workspace.yaml`), no Turborepo.
Two apps and two internal packages don't need build orchestration yet — see
[ADR-002](./06-decisions.md#adr-002-pnpm-workspaces-no-turborepo-no-monorepo-build-tool).

No BullMQ, no Socket.IO, no Redis. See
[`SPEC.md` Part 11](../SPEC.md#part-11--architecture-and-hosting) for the
reasoning — this data volume (~500 transactions/day) does not need a job
queue or a realtime layer. "Scheduled jobs" (reconciliation, expiry — Phase
9) are plain, idempotent, read-only `GET` endpoints
(`/reports/reconciliation`, `/reports/expiry`), not an in-process scheduler
— nothing in this repo triggers them on a timer. Once deployed, an external
cron / hosting-provider scheduled task hits them; until then, they're called
on demand from the Reports screen.

## Data flow (target shape, built out phase by phase)

```
Counter screen (apps/web)
  → catalogue loaded into memory once at login
  → order built entirely client-side, zero network calls per tap
  → ONE POST to apps/api on "Issue & Print"

apps/api
  → validates (customer, items, credit, stock)
  → packages/logic for all costing/pricing/allocation math
  → packages/db (Prisma) for one transaction:
      issue + lines, stock decrement, stock_movement rows,
      customer_ledger entry, balance update, audit_log entry
  → returns the created issue; apps/web prints from the response
```

## Multi-tenancy

Every table carries `warehouseId`. An API middleware (Phase 2) injects it
from the authenticated session — it is never read from the request body.
Single warehouse today; this costs nothing now and avoids a painful
migration later if a second warehouse is added.

## Money and quantity representation

Postgres `DECIMAL` columns via Prisma's `Decimal` type; `packages/logic`
does all arithmetic through `decimal.js` (the same library Prisma's client
uses internally, so values round-trip losslessly). Never `Float`/`number`
for anything that is money or stock quantity. Rationale:
[ADR-001](./06-decisions.md#adr-001-decimaljs-for-all-money-and-quantity-math).

## Design system

`apps/web`'s Tailwind theme and the `<Logo>` component are built from the
real Dineiz brand assets, not invented — see
[ADR-007](./06-decisions.md#adr-007-design-system-built-from-the-real-dineiz-brand-assets-not-invented).
Shared UI primitives live in `apps/web/components/ui/` (`Button`, `Input`,
`Modal`) — extend these rather than hand-rolling a new button style per
screen.

## Hosting (target, Phase 9+)

Railway/Render for `apps/api` + Postgres (or Neon), Vercel free tier for
`apps/web`. ~$10–17/month at the spec's target scale (50 restaurants, 2,000
items, 500 issues/day) — see
[`SPEC.md` Part 11](../SPEC.md#part-11--architecture-and-hosting).
