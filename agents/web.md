# Lesefluss Website

TanStack Start (React SSR) project website. Open-source project site - showcases the app and device, lets people download/build freely, and optionally create an account for cloud sync.

For project overview see `../AGENTS.md`.

## Tech Stack

- **TanStack Start** (React SSR) + TanStack Router (file-based)
- **TanStack Query** (`@tanstack/react-query`) - `QueryClientProvider` in `__root.tsx`, `staleTime: 0`; **TanStack Table** (`@tanstack/react-table`) - used on `/admin`
- **Drizzle ORM** + PostgreSQL (`drizzle-orm/node-postgres`)
- **Better Auth** v1.6.x - email+password, self-hosted, Drizzle adapter, `tanstackStartCookies` plugin
- **Deployment**: Docker on VPS via Coolify (Dockerfile-based)

## Development

```bash
pnpm install
pnpm dev      # dev server
pnpm build
```

## Routes

| Route | Status | Notes |
|-------|--------|-------|
| `/` | ✅ | Hero with live RSVP preview → App section → Features → Device section → Open source CTA |
| `/app/*` | ✅ | Embedded capacitor web build (SPA catch-all, see Web App Embed below) |
| `/download` | ✅ | Download buttons, feature grid, requirements |
| `/device` | ✅ | Hardware page: AMOLED vs ST7789 cards, parts list, build guide CTA |
| `/docs` | ✅ | Single-page docs with sidebar (Getting Started, Importing Books, ESP32 Build Guide, Connecting Device, Troubleshooting) |
| `/login` | ✅ | Sign-in / sign-up with Better Auth email+password (`noindex`) |
| `/privacy` | ✅ | Privacy policy |
| `/terms` | ✅ | Terms of Service |
| `/imprint` | ✅ | TMG §5 Impressum (postal address still TODO) |
| `/robots.txt` | ✅ | Server route in `routes/robots[.]txt.ts` |
| `/sitemap.xml` | ✅ | Server route in `routes/sitemap[.]xml.ts` - keep URL list in sync when adding public routes |
| `/diy` | ✅ | Redirects to `/device` |
| `/order` | ✅ | Redirects to `/device` |
| `/api/sync` | ✅ | GET (pull) + POST (push) - full-snapshot sync, requireAuth + CORS + rate-limited (30/min per user) |
| `/profile` | ✅ | Auth-gated reading activity: stats, book library, highlights with text snippets + notes. Header links to `/account`. |
| `/account` | ✅ | Auth-gated account settings: email display, change password, danger zone (clear cloud data, delete account). `noindex`. |
| `/admin` | ✅ | Admin-only (requires `ADMIN_EMAIL` env var match). Stats overview + paginated user/book tables with delete. `noindex`. |
| `/changelog` | ✅ | Public changelog - date-based entries, river timeline design. Data lives in `src/data/changelog.ts`. |

## routeTree.gen.ts

`src/routeTree.gen.ts` is **auto-generated** by the TanStack Router vite plugin. Never edit it manually - it is overwritten on every dev server start. Add/rename/delete route files only.

## Database Schema (Postgres)

Mirrors the capacitor app's SQLite schema. One account → many devices, each device has its own copy of the data. Sync merges by `updated_at` (last-write-wins).

```
users              - Better Auth managed
accounts           - Better Auth managed
sessions           - Better Auth managed

sync_books         - mirrors capacitor `books` (user_id, book_id, title, author, file_size, word_count, position, content, cover_image, chapters, updated_at)
sync_settings      - mirrors capacitor `settings` (user_id) - columns driven by SYNCED_SETTING_KEYS in rsvp-core
sync_highlights    - mirrors capacitor `highlights` (user_id, highlight_id, text - extracted snippet stored at highlight-creation time)
```

Books store full plain text content, base64 cover image, and chapters JSON server-side for cross-device restore. Content is immutable per bookId - only pushed once.

## Auth (`src/lib/auth.ts`)

Better Auth wired at `src/routes/api/auth/$.ts` (catch-all handler). Client-side hooks in `src/lib/auth-client.ts`. Environment variables needed: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`.

Trusted origins and CORS allowed origins share a single list in `src/lib/allowed-origins.ts`. Production origin is `https://lesefluss.app`. Dev origins (`http://localhost`, `http://localhost:3001`) are only included when `NODE_ENV !== "production"`.

Rate limiting: Better Auth's built-in limiter is enabled (10 req/min, memory storage).

## Security & SEO

- **Response headers** - set globally via Nitro `routeRules` in `vite.config.ts`: HSTS, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, and a pragmatic CSP (`'unsafe-inline'` for script/style, external origins derived from `GOATCOUNTER_URL` / `BETTER_AUTH_URL` env vars).
- **Rate limiting** - `/api/sync` uses `src/lib/rate-limit.ts` (in-memory token bucket, 30/min per user; single-instance VPS, resets on restart). Body size cap is enforced at the reverse proxy, not in Node.
- **Meta + canonical** - `src/utils/seo.ts` exports `seo({ title, description, path })` returning `{ meta, links }`. Each public route spreads this. The root intentionally calls `seo()` without `path` so no canonical is emitted; each child route emits its own.
- **Structured data** - `src/utils/structured-data.ts` provides `WebSite`, `Organization`, `SoftwareApplication`, and `faqPageSchema()` helpers. Root injects WebSite+Organization site-wide; `/` adds SoftwareApplication; `/docs` adds FAQPage from troubleshooting items.
- **Verification scaffolding** - `buildVerificationMeta()` in `seo.ts` emits Google/Bing site-verification meta when `GOOGLE_SITE_VERIFICATION` / `BING_SITE_VERIFICATION` env vars are set.
- **Legal pages** - privacy, terms, imprint share `src/components/legal-page.tsx` shell.
- **OG image** - `public/og.png` (1200×630, split layout with Lesefluss wordmark + device render).
- **`/app/*` is `noindex`** - injected at both runtime (`src/lib/spa-html.ts`) and build time (`scripts/build-capacitor-embed.sh` patches `public/app/index.html`).

## Sync Architecture

Simple full-snapshot sync first. Delta sync can come later.

**Flow:**
1. User logs in → session token stored in Capacitor `@capacitor/preferences`
2. On app open: `GET /api/sync` → merge into local DB (server wins if `updated_at` newer)
3. On any local write: debounced `POST /api/sync` with updated rows

**Conflict resolution:** last-write-wins by `updated_at` for all entities. Highlights need a tombstone/soft-delete flag for deletions.

## Web App Embed

The capacitor app is built as a static SPA and served under `/app/*`. This gives the website the full app experience (library, reader, RSVP, highlights) without duplicating UI code.

**Build:** `pnpm build:app` (runs `scripts/build-capacitor-embed.sh`) - builds capacitor with `WEB_BUILD=1 VITE_SYNC_URL="" VITE_WEB_BUILD=true`, copies output to `public/app/`.

**SPA fallback:** `src/routes/app/$.ts` and `src/routes/app/index.ts` serve the capacitor `index.html` for all `/app/*` paths. Static assets (JS, CSS, WASM) in `public/app/assets/` are served directly by Nitro.

**Auth:** Same-domain cookie auth - user logs in on `/login`, the capacitor app detects the session via `/api/auth/get-session` and syncs automatically. No second login needed.

**Web adaptations in capacitor app:**
- `VITE_WEB_BUILD` env var enables: router basename `/app`, cookie auth (no Bearer token), WASM path `/app/assets`
- BLE/device UI hidden via `Capacitor.getPlatform() === "web"` checks
- File import uses HTML5 `<input type="file">` instead of native FilePicker
- `public/app/` is gitignored (build artifact)

## Open Todo

### Phase 3 - Sync ✅
- [x] `GET /api/sync` + `POST /api/sync` endpoints
- [x] Capacitor app sync service + `@capacitor/preferences` for session token
- [x] Login/account screen in capacitor app (optional, dismissible)
- [x] Sync indicator in capacitor UI (last synced timestamp)
- [x] Web app embed - capacitor SPA at `/app/*` with cookie auth

### Changelog

When shipping a notable feature, add an entry to `src/data/changelog.ts`. Each entry has a `date` (ISO), `title`, `tags` (`"App" | "ESP32" | "Website"`), and `changes` (string array). Group related commits into one entry rather than one entry per commit. The page at `/changelog` renders this file automatically - no other changes needed.

### Phase 4 - Polish
- [x] `/profile` page (stats, library, highlights)
- [x] `/account` page (change password, danger zone)
- [ ] Full docs (wiring diagrams, screenshots)
- [x] Replace Ko-fi placeholder in `/device` with real URL
- [ ] Replace disabled Play Store badge in `/download` with real URL once published
- [x] Open Graph images, SEO pass (robots.txt, sitemap.xml, JSON-LD, canonical, per-route meta)
- [x] Security headers (CSP, HSTS, etc.) + rate limiting on auth + sync
- [x] Legal pages (Privacy, Terms, Imprint - address TODO)
- [ ] Transactional email provider for Better Auth verification emails (Resend / Postmark)
- [ ] MDX migration for `/docs` if content grows significantly
- [x] Desktop sidebar nav for `/app` (brand link, Library/Settings nav)
- [x] Desktop UI polish for `/app` (wider layouts, keyboard shortcuts)

## Deployment

Deployed on Coolify at `lesefluss.app` using the repo's `apps/web/Dockerfile`. The Dockerfile builds both the capacitor web embed and the TanStack Start app in a multi-stage build. The entrypoint script (`scripts/entrypoint.sh`) runs `drizzle-kit push` on startup to apply schema changes to Postgres.

Environment variables (set in Coolify): `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ADMIN_EMAIL` (unlocks `/admin` for that account).

## Landing Page Components

- **`src/components/rsvp-preview.tsx`** - live animated RSVP word display (Hemingway sample text at 300 WPM, ORP highlighting). Used in the hero section.
- **`src/components/hero-rsvp.tsx`** - hero section wrapper combining the RSVP preview with headline text.
- **`src/components/feature-card.tsx`** - reusable card for the features grid.

## Open Questions

- **Donation platform**: Ko-fi vs GitHub Sponsors vs custom - placeholder in `/device` ready
- **Play Store**: needs publish decision before `/download` badge goes live
