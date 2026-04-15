FROM node:22-alpine AS base
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/rsvp-core/package.json ./packages/rsvp-core/
COPY packages/ble-config/package.json ./packages/ble-config/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/
RUN pnpm --filter @lesefluss/web build

FROM base AS runner
WORKDIR /app
COPY --from=build /app/apps/web/.output ./.output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
