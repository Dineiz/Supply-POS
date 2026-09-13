# Build context must be the repo root (this app depends on workspace
# packages/db and packages/logic): docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS base
RUN corepack enable

FROM base AS deps
WORKDIR /repo
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/logic/package.json packages/logic/package.json
RUN pnpm install --frozen-lockfile --filter @dineiz-supply/api...

FROM deps AS build
COPY packages/db packages/db
COPY packages/logic packages/logic
COPY apps/api apps/api
RUN pnpm --filter @dineiz-supply/db generate

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
WORKDIR /repo
COPY --from=build --chown=app:app /repo ./
USER app
WORKDIR /repo/apps/api
EXPOSE 4000
CMD ["sh", "-c", "pnpm --filter @dineiz-supply/db migrate:deploy && pnpm start"]
