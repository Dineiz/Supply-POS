# Deployment

This app ships as two Docker images (`apps/api/Dockerfile`,
`apps/web/Dockerfile`) plus a Postgres database. The images are
host-agnostic — the same ones work on Railway, Render, Fly.io, a VPS, or
anywhere else that runs a container. `SPEC.md` Part 11's sizing target
(~$10–17/month) assumes a small managed host, not this repo's own
`docker-compose.yml` (that file is for local verification only — see its
header comment).

## 1. Provision Postgres

Any managed Postgres works (Neon, Railway, Render, Supabase, RDS). You need
one connection string in the standard form:

```
postgresql://USER:PASSWORD@HOST:PORT/DBNAME?schema=public
```

## 2. Required environment variables

**API** (`apps/api`):

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | From step 1. |
| `JWT_SECRET` | Yes | Long random string. Generate with `openssl rand -hex 32`. The API now **refuses to start in production without this set** — it will not silently fall back to the development default. |
| `CORS_ORIGIN` | Yes | The web app's public URL(s), comma-separated (e.g. `https://app.example.com,https://www.example.com`). No trailing slash. |
| `NODE_ENV` | Yes | Set to `production`. |
| `PORT` | No | Defaults to `4000`. Most hosts inject this automatically. |

**Web** (`apps/web`):

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Yes | The API's public URL, e.g. `https://api.example.com`. Baked into the client bundle **at build time** — if you change it, you must rebuild the image, not just restart the container. |

Never commit real values for any of these — `packages/db/.env` and
`apps/api/.env` are gitignored on purpose; set them in the host's dashboard
or secrets manager.

## 3. Apply database migrations

Run once per deploy, before starting the API on a schema change:

```bash
DATABASE_URL="postgresql://..." pnpm db:migrate:deploy
```

This runs `prisma migrate deploy` — the non-interactive command meant for
this (see [ADR-006](./06-decisions.md#adr-006-prisma-migrate-dev--migrate-reset-dont-run-in-this-environment--write-migrations-by-hand)).
Never run `pnpm db:migrate` (`migrate dev`) against a production database.

## 4. Build and run the images

```bash
# From the repo root (build context matters — both Dockerfiles read
# workspace packages outside their own app folder):
docker build -f apps/api/Dockerfile -t dineiz-supply-api .
docker build -f apps/web/Dockerfile -t dineiz-supply-web \
  --build-arg NEXT_PUBLIC_API_URL=https://api.example.com .

docker run -p 4000:4000 \
  -e DATABASE_URL=... -e JWT_SECRET=... -e CORS_ORIGIN=https://app.example.com \
  -e NODE_ENV=production dineiz-supply-api

docker run -p 3000:3000 dineiz-supply-web
```

On Railway/Render/Fly, point the service at the repo, set the Dockerfile
path (`apps/api/Dockerfile` or `apps/web/Dockerfile`) and **build context to
the repo root** (not the app subfolder — this is the most common
misconfiguration), and set the env vars from step 2 in the dashboard.

**Web on Vercel instead of Docker** works too and is what `SPEC.md` Part 11
actually recommends (free tier, zero container to manage): set the
project's Root Directory to `apps/web`, leave the install/build commands on
their Next.js defaults, and set `NEXT_PUBLIC_API_URL` as a project
environment variable (Production + Preview).

## 5. Seed data (optional, non-production only)

`pnpm --filter @dineiz-supply/db seed` creates demo users/items/customers.
**Do not run this against a real customer's database** — it's for local
dev/staging only.

## 6. Smoke test after every deploy

1. `GET https://api.example.com/health` → `{"status":"ok",...}`.
2. Log in on the web app (owner email/password or clerk PIN).
3. Create or view an item; confirm the list loads (proves the API ↔ DB
   connection works end to end, not just that the process is up).
4. Issue something from the counter screen and print it (proves the
   web ↔ API connection and `NEXT_PUBLIC_API_URL` are wired correctly).

## Pre-launch checklist

- [ ] `JWT_SECRET` is a freshly generated value, not anything used in local
      testing or committed to a `.env.example`.
- [ ] The production database has **no seed/demo data** — real warehouse
      data only.
- [ ] `CORS_ORIGIN` matches the exact production web URL(s), no `localhost`.
- [ ] Database has automated backups enabled on whichever host you chose
      (this repo does not run its own backup job).
- [ ] The 5 open questions in [`SPEC.md` Part 0](../SPEC.md#part-0--assumptions-decided-override-any-of-them)
      are confirmed with the actual client — they don't block deploying, but
      they do affect whether Phase 1's assumptions still hold.
- [ ] Someone is watching logs (`docker logs`, or the host's log viewer) for
      the first real day of use — the API logs structured JSON via Fastify's
      built-in logger, no extra setup needed.
- [ ] Optional but recommended once real money is on the line: an error
      tracker (e.g. Sentry) and an uptime check on `/health` — neither is
      built into this repo today; both are ordinary additions if you want
      them, not required to go live.
