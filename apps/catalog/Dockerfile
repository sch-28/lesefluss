FROM node:22-alpine AS base
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/rsvp-core/package.json ./packages/rsvp-core/
COPY packages/ble-config/package.json ./packages/ble-config/
COPY apps/web/package.json ./apps/web/
COPY apps/capacitor/package.json ./apps/capacitor/
COPY apps/catalog/package.json ./apps/catalog/
RUN pnpm install --frozen-lockfile --filter @lesefluss/catalog...

FROM deps AS build
COPY apps/catalog/ ./apps/catalog/
RUN pnpm --filter @lesefluss/catalog build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps  /app/pnpm-workspace.yaml /app/package.json /app/pnpm-lock.yaml ./
COPY --from=deps  /app/apps/catalog/package.json ./apps/catalog/
COPY --from=deps  /app/node_modules ./node_modules
COPY --from=deps  /app/apps/catalog/node_modules ./apps/catalog/node_modules
COPY --from=build /app/apps/catalog/dist ./apps/catalog/dist
COPY --from=build /app/apps/catalog/drizzle ./apps/catalog/drizzle
WORKDIR /app/apps/catalog
EXPOSE 2999
CMD ["node", "dist/index.js"]
