FROM node:22-alpine AS base
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/rsvp-core/package.json ./packages/rsvp-core/
COPY packages/ble-config/package.json ./packages/ble-config/
COPY apps/web/package.json ./apps/web/
COPY apps/capacitor/package.json ./apps/capacitor/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY packages/ ./packages/
COPY apps/capacitor/ ./apps/capacitor/
COPY apps/web/ ./apps/web/
# Copy sql-wasm.wasm into capacitor public/ (gitignored, needs setup)
RUN cd apps/capacitor && node scripts/setup-web.mjs
# Build capacitor web embed → apps/web/public/app/
RUN cd apps/capacitor && WEB_BUILD=1 VITE_SYNC_URL="" VITE_WEB_BUILD=true pnpm build
RUN rm -rf apps/web/public/app && cp -r apps/capacitor/dist apps/web/public/app
# Build web app (includes embedded capacitor build in public/app/)
RUN pnpm --filter @lesefluss/web build

FROM base AS runner
WORKDIR /app
COPY --from=build /app/apps/web/.output ./.output
# Drizzle schema + config for db:push at startup
COPY --from=build /app/apps/web/drizzle.config.ts ./drizzle.config.ts
COPY --from=build /app/apps/web/src/db/schema.ts ./src/db/schema.ts
COPY --from=build /app/apps/web/src/db/auth-schema.ts ./src/db/auth-schema.ts
RUN npm install --no-save drizzle-kit drizzle-orm pg
COPY apps/web/scripts/entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["./entrypoint.sh"]
