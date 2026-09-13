# Testing

## Phase 1 verification (this phase)

Run from the repo root:

```bash
pnpm install
pnpm --filter @dineiz-supply/logic test        # vitest — all pure functions
pnpm typecheck                                  # tsc --noEmit, every package
pnpm --filter @dineiz-supply/db exec prisma validate
pnpm --filter @dineiz-supply/db exec prisma generate
```

Expected: all logic tests green, no type errors, schema validates and
generates a client without a live database connection. See
[07-progress.md](./07-progress.md) for the current run's results.

Manual checks:
- `pnpm dev:web` → `http://localhost:3000` shows the placeholder page.
- `pnpm dev:api` → `GET http://localhost:4000/health` returns
  `{ status: "ok", service: "dineiz-supply-api" }`.

## Costing engine — specific scenarios to keep green

These map 1:1 to `packages/logic/src/costing.test.ts` and the worked
examples in [02-costing-engine.md](./02-costing-engine.md). If either the
formula or the numbers in the doc ever diverge from the test file, one of
them is wrong — fix both together.

- `calculateMovingAverage(50, 140, 30, 152)` → `144.50`
- `calculateMovingAverage(0, *, 20, 160)` → `160` (zero-stock reset)
- `calculateMovingAverage(-5, 140, 20, 160)` → `160` (negative-stock reset)
- `calculateMarginPercent(0, x)` → `0`, not `NaN`/`Infinity`
- `allocatePayment` never allocates more than an invoice's own balance, and
  never leaves a positive `unallocatedAmount` while an invoice still has an
  outstanding balance

## Future-phase verification checklist (fill in as each phase lands)

| Phase | Verify |
|---|---|
| 2 — Master data | Item with BAG→KG conversion displays "1 BAG = 50 KG" correctly; opening stock write creates an `OPENING` `StockMovement` |
| 3 — Receiving | The exact 50kg@140 → 30kg@152 → 144.50 scenario, end to end through the API, `StockMovement.avgCostBefore/After` both correct |
| 4 — Counter screen | 20-item order build-to-print timed manually; single network POST confirmed via browser devtools/network log |
| 5 — Printing | Delivery Note + Picking Slip render at 80mm, account-summary block visually dominant, reprint increments `printCount` |
| 6 — Returns/payments | The full Part 4 ledger scenario reproduced exactly (800 → 480 → 1,560 → 560) |
| 7 — Wastage/count | 2kg tomato wastage reduces stock and books `qty × currentAvgCost` exactly |
| 8 — Reports | P&L gross margin cross-checked by hand-summing issue line costs |
| 9 — Hardening | Nightly job flags a deliberately-introduced balance mismatch |

## Principles

- Every pure function in `packages/logic` gets its own `*.test.ts` covering
  at minimum: the normal case, a zero input, a negative input where the
  domain allows it, and a division-by-zero guard where relevant.
- Never mock the database for a flow test once one exists (Phase 4+) — a
  real Postgres (or a throwaway test schema) only, per the same reasoning
  the costing engine exists: a mocked ledger passing tests while the real
  one drifts is worse than no test.
