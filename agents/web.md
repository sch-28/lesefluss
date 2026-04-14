# RSVP Website

TanStack Start (React SSR) project website. Open-source project site — showcases the app and device, lets people download/build freely, and optionally create an account for cloud sync.

> **THE WEBSITE HAS NOT DEPLOYED YET — STILL IN DEV**

For project overview see `../AGENTS.md`.

## Tech Stack

- **TanStack Start** (React SSR) + TanStack Router (file-based)
- **Drizzle ORM** + PostgreSQL (`drizzle-orm/node-postgres`)
- **Better Auth** v1.6.x — email+password, self-hosted, Drizzle adapter, `tanstackStartCookies` plugin
- **Deployment**: Docker on VPS (Dockerfile scaffolded)

## Development

```bash
pnpm install
pnpm dev      # dev server
pnpm build
```

## Routes

| Route | Status | Notes |
|-------|--------|-------|
| `/` | ✅ | Hero → App section → Features → Device section → Open source CTA |
| `/app` | ✅ | Download buttons, feature grid, requirements |
| `/device` | ✅ | Hardware page: AMOLED vs ST7789 cards, parts list, build guide CTA |
| `/docs` | ✅ | Single-page docs with sidebar (Getting Started, Importing Books, ESP32 Build Guide, Connecting Device, Troubleshooting) |
| `/login` | ✅ | Sign-in / sign-up with Better Auth email+password |
| `/diy` | ✅ | Redirects to `/device` |
| `/order` | ✅ | Redirects to `/device` |
| `/account` | ❌ | Not started — auth-gated; connected devices, sync status, danger zone |

## routeTree.gen.ts

`src/routeTree.gen.ts` is **auto-generated** by the TanStack Router vite plugin. Never edit it manually — it is overwritten on every dev server start. Add/rename/delete route files only.

## Database Schema (Postgres)

Mirrors the capacitor app's SQLite schema. One account → many devices, each device has its own copy of the data. Sync merges by `updated_at` (last-write-wins).

```
users              — Better Auth managed
accounts           — Better Auth managed
sessions           — Better Auth managed

sync_books         — mirrors capacitor `books` (user_id, book_id, title, author, file_size, word_count, cover_url, position, updated_at)
sync_settings      — mirrors capacitor `settings` (user_id)
sync_highlights    — mirrors capacitor `highlights` (user_id, highlight_id)
```

Book *files* are **not** stored server-side — metadata + position only.

## Auth (`src/lib/auth.ts`)

Better Auth wired at `src/routes/api/auth/$.ts` (catch-all handler). Client-side hooks in `src/lib/auth-client.ts`. Environment variables needed: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`.

## Sync Architecture

Simple full-snapshot sync first. Delta sync can come later.

**Flow:**
1. User logs in → session token stored in Capacitor `@capacitor/preferences`
2. On app open: `GET /api/sync` → merge into local DB (server wins if `updated_at` newer)
3. On any local write: debounced `POST /api/sync` with updated rows

**Conflict resolution:** last-write-wins by `updated_at` for all entities. Highlights need a tombstone/soft-delete flag for deletions.

## Open Todo

### Phase 3 — Sync
- [ ] `GET /api/sync` + `POST /api/sync` endpoints
- [ ] Capacitor app sync service + `@capacitor/preferences` for session token
- [ ] Login/account screen in capacitor app (optional, dismissible)
- [ ] Sync indicator in capacitor UI (last synced timestamp)

### Phase 4 — Polish
- [ ] `/account` page (connected devices, sync status, danger zone)
- [ ] Full docs (wiring diagrams, screenshots)
- [ ] Replace Ko-fi placeholder in `/device` with real URL
- [ ] Replace disabled Play Store badge in `/app` with real URL once published
- [ ] Open Graph images, SEO pass
- [ ] Transactional email provider for Better Auth verification emails (Resend / Postmark)
- [ ] MDX migration for `/docs` if content grows significantly

## Open Questions

- **Donation platform**: Ko-fi vs GitHub Sponsors vs custom — placeholder in `/device` ready
- **Play Store**: needs publish decision before `/app` badge goes live
- **Domain**: not yet set — affects `BETTER_AUTH_URL` and CORS config
