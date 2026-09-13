# Dineiz Supply

A warehouse and distribution management system for a wholesale food supply
business: buy from market/suppliers, hold stock in a warehouse, issue to
restaurant kitchens on credit.

Separate product, separate repo, separate database from the Dineiz POS
monorepo. No shared code, no shared data.

Read [`SPEC.md`](./SPEC.md) first — it is the source of truth for every
design decision in this repo. Then read [`docs/00-index.md`](./docs/00-index.md)
for the current state of the build.

## Structure

```
apps/
  web/        Next.js 15 App Router — the whole UI
  api/        Fastify — REST API
packages/
  db/         Prisma schema, migrations, client
  logic/      Pure functions: costing, pricing, totals, allocation. No I/O.
docs/         The project vault — architecture, schema, decisions, progress
```

## Getting started

```bash
pnpm install
cp packages/db/.env.example packages/db/.env   # set DATABASE_URL
pnpm db:generate
pnpm db:migrate
pnpm dev:web     # http://localhost:3000
pnpm dev:api     # http://localhost:4000/health
```

## Status

All 10 build phases done (see [`docs/07-progress.md`](./docs/07-progress.md)
for the exact per-phase checklist); production-readiness hardening done in
Phase 11 (same file).

## Deployment

See [`docs/10-deployment.md`](./docs/10-deployment.md) for Docker images,
required environment variables, migrations, and a pre-launch checklist.
