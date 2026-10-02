---
id: TASK-171.1
title: 'Social identity: unique handle, profile fields and visibility settings'
status: Done
assignee:
  - claude
created_date: '2026-09-25 22:09'
updated_date: '2026-10-02 16:58'
labels:
  - social
  - web
  - app
dependencies: []
documentation:
  - backlog/decisions/ADR-0004-friends-only-book-sharing.md
parent_task_id: TASK-171
priority: high
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Foundation for everything social: a user needs a stable, unique, human-readable identity that tells them apart from other users with the same display name, plus control over what their friends see.

Today the better-auth `user` table (`apps/web/src/db/auth-schema.ts`) has `name` (free-text display name, not unique), `email` and `image`. Nothing identifies a user to other users and email must never be exposed socially. `name` for Google/Discord sign-ups is whatever the provider supplied (often the person's full real name); for email sign-ups it is what they typed on `apps/web/src/routes/login`.

Handles are a display identity (shown as @handle) and a stable reference in reports. They are not searchable and do not appear in any URL; people connect only through invite links and in-app requests (TASK-171.2).

Scope:
- **Handle**: unique, case-insensitive, 3 to 20 characters from `[a-z0-9_]`, stored lowercase. Users without a handle are invisible to other users and cannot use social features until they pick one. Existing users are prompted the first time they open the Social tab (prompt UI in TASK-171.3; this task provides the API); new users can set it during onboarding (signed-in branch of `apps/capacitor/src/pages/onboarding/steps/sync.tsx`, skippable) or later in settings. Reserved words live in one server-side list, at least: admin, administrator, root, system, lesefluss, support, help, moderator, mod, staff, official, team, api, app, u, invite, share, report, login, signup, settings, account, profile, privacy, terms, imprint.
- **Handle changes**: at most once every 30 days. The old handle is released and cannot be claimed by anyone else for 90 days, so friends and reports that know the old handle do not end up pointing at a stranger; the previous owner may reclaim it meanwhile. A handle force-reset by an admin (TASK-171.6 calls a service function from this task) is released the same way, except the previous owner cannot reclaim it either.
- **Handle claim step** (onboarding, settings, and reused by the TASK-171.3 prompt): inline availability and validation errors (taken, reserved, invalid, rate-limited, offline). Before confirming, it shows exactly what becomes visible to others: the handle, the display name (prefilled from `user.name`, editable in the step) and the avatar (none by default). Nothing about the user is visible to anyone before the claim is confirmed.
- **Profile fields**: display name (reuse `user.name`; trimmed, 1 to 50 characters, control and bidirectional-override characters rejected), avatar, and bio (plain text, at most 160 characters, same character rules, rendered as text, never HTML or linkified). Avatar options: upload JPEG, PNG or WebP (max 5 MB); use the Google/Discord picture (`user.image`) only when the user explicitly chooses "use my account picture"; or none (default; clients show initials). The avatar can be removed at any time.
- **What others always see**: handle, display name and avatar form the identity card shown wherever another user legitimately encounters you (friend requests and lists, invite pages, buddy-read participants, later shares). Profile visibility controls everything beyond the card: bio and the sections below. Settings and the privacy policy say this plainly so "private" is not misread as invisible.
- **Visibility settings** (server-side, one row per user):
  - Profile visibility: `private` (default: bio and sections visible only to you) or `friends`. There is no public level; profiles are only ever shown in the app, to friends.
  - Per-section toggles: currently reading, finished books, reading stats, shared highlights, all default on. A section is shown only if both the visibility and its toggle allow it.
- **Settings UI** in the app (new screen under `apps/capacitor/src/routes/tabs/settings/`, linked from `settings/index.tsx`, visible only when signed in and `SYNC_ENABLED`) and on the website account page (`apps/web/src/routes/_authenticated/account/index.tsx`) to edit all of the above. The app screen has loading, offline/error-with-retry (no stale local copy) and no-handle (claim step) states.
- **Privacy policy** (`apps/web/src/routes/privacy/index.tsx`): the identity card and who sees it, what each visibility level exposes, that avatars are re-encoded with image metadata removed, that choosing the account picture copies it from Google/Discord once, the legal basis (contract, for a feature the user opts into), and that a released handle string is kept for 90 days after a change or account deletion without any link to the account.
- **Terms** (`apps/web/src/routes/terms/index.tsx`): rules for handles, display names, bios and avatars (no impersonation of people or of Lesefluss, no unlawful or abusive content) and that we may reset or remove them (tooling in TASK-171.6).
- **Glossary**: add Handle and Profile visibility (including the identity card) to `CONTEXT.md`.

Out of scope: rendering profiles for friends (TASK-171.5), the friend graph (TASK-171.2), the Social tab and its prompt UI (TASK-171.3), reporting and admin removal UI (TASK-171.6).

Implementation notes:
- Prefer a separate `social_profile` table keyed by `user_id` in `apps/web/src/db/schema.ts` (migration in `apps/web/drizzle/`) over widening the generated better-auth schema. The better-auth `username` plugin is not installed (`auth.ts` uses `bearer()` and `admin()` only); adopting it is acceptable only if normalisation, reserved words, cooldown and grace period still hold.
- No backfill: a missing `social_profile` row means "no handle, defaults". Every read path treats a missing row as the defaults; the row is created lazily on first write.
- Uniqueness is enforced by a DB unique index on the normalised handle, not only a pre-check (race). Released handles must participate in the same uniqueness, so a single handle table keyed by normalised handle (current owner, `released_at`, whether the previous owner may reclaim) is simpler than a history table plus pre-check. Validate raw input against `[A-Za-z0-9_]` before lowercasing, so Unicode that lowercases into ASCII (e.g. the Kelvin sign) is rejected. Released rows older than 90 days can be treated as free lazily on claim; there is no job runner.
- Endpoints: the native app and the web build call `/api/*` file routes, not `createServerFn` (website only, e.g. `apps/web/src/lib/profile.ts`). Add routes such as `apps/web/src/routes/api/social/profile.ts` with the `cors` + `requireAuth` middleware of `api/sync.ts` (bearer on native, cookie on the web build); website server functions call the same service module. `cors` only allows `GET, POST, OPTIONS` and the headers `Content-Type, Authorization, X-Sync-Have`; stay within those or extend `apps/web/src/lib/cors-middleware.ts`. Rate-limit availability checks, claims and avatar uploads per user with `checkLimit` (`apps/web/src/lib/rate-limit.ts`, keys like `social-handle:${userId}`). The availability check answers only for the exact handle being claimed and is never a way to look users up.
- Client: this is the first subtask needing authed requests outside sync, so extract the bearer/cookie logic of the module-private `syncFetch` (`apps/capacitor/src/services/sync/index.ts`) into a shared authed-fetch helper, as TASK-171 requires.
- Social profile data is not in the sync payload, so older app versions are unaffected and there is no last-write-wins or tombstone interaction. The app reads it with TanStack Query; nothing is stored in local SQLite.
- Avatars: the site CSP (`apps/web/vite.config.ts`, `img-src 'self' data: blob:` plus the catalog origin) blocks Google/Discord URLs, and hot-linking would leak viewers' IPs to them. Store a 256px WebP made with `sharp` (already an `apps/web` dependency; re-encoding drops EXIF including GPS) in Postgres and serve it from an `/api/social/avatar/...` route with cache headers and a URL that changes with the avatar. "Use my account picture" fetches `user.image` once server-side with a timeout and the same cap. Enforce the size cap before decoding and limit decoded pixel dimensions.
- Account deletion has three paths: `deleteUserAccount` (`apps/web/src/lib/account-deletion.ts`), better-auth's `deleteUser.afterDelete` in `lib/auth.ts`, and `deleteAdminUser` in `apps/web/src/lib/admin.ts` (own inline deletes). Give `social_profile` and avatar storage an FK to `user.id` with `onDelete: "cascade"`, and the handle table's owner column `onDelete: "set null"` so the released handle survives deletion for the grace period without the user's id. TASK-171 also asks the first subtask adding a social table to switch `deleteAdminUser` to `deleteUserAccount`; do that here and extend `account-deletion.integration.test.ts`. "Clear cloud data" (`clearCloudData` in `lib/profile.ts`, and the app's wipe actions) must not touch social profile data.
- Social responses use an explicit column allowlist (handle, display name, avatar URL, bio, visibility); never spread the better-auth `user` object (email, role, ban fields), and never return the raw `user.image` provider URL.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A signed-in user can claim a handle; a second user cannot claim the same handle in any letter case
- [x] #2 Handles shorter than 3 or longer than 20 characters, outside [a-z0-9_] (including Unicode that lowercases into ASCII), or on the reserved list are rejected with a message naming the reason
- [x] #3 Concurrent claims of the same handle result in exactly one success (enforced by a unique index)
- [x] #4 A second handle change within 30 days of the last one is refused
- [x] #5 A released handle cannot be claimed by another user for 90 days; the previous owner can reclaim it unless it was force-reset by an admin; after 90 days anyone can claim it
- [x] #6 The claim step shows the handle, display name and avatar that will become visible before the user confirms, and lets them edit the display name there
- [x] #7 A user with no handle is not returned by any social endpoint to other users
- [x] #8 Display names longer than 50 characters, bios longer than 160 characters, and either containing control or bidirectional-override characters are rejected
- [x] #9 A user can upload, replace and remove an avatar; uploads over 5 MB or that are not JPEG, PNG or WebP are rejected
- [x] #10 Stored avatars are resized server-side and contain no EXIF or other image metadata
- [x] #11 The Google or Discord account picture is used as the avatar only after the user explicitly chooses it; a new handle has no avatar by default
- [x] #12 Avatars are served from the Lesefluss origin and render on the website under its existing CSP; no social response contains the provider image URL
- [x] #13 Profile visibility defaults to private and section toggles default to on for new and existing users, without a data backfill
- [x] #14 Profile visibility accepts only private or friends; any other value is rejected
- [x] #15 Profile visibility and section toggles are editable in the app settings (native and web build) and on the website account page, and persist server-side
- [x] #16 The app settings screen shows an offline or error state with retry when the server is unreachable
- [x] #17 Email address and account role or ban fields are never returned by any social endpoint
- [x] #18 Handle availability checks, handle claims and avatar uploads are rate-limited per user
- [x] #19 Deleting the account through the user self-service path, the better-auth delete-user path, or the admin delete-user action removes the social profile and avatar, and the released handle stays blocked for others for 90 days
- [x] #20 Clearing cloud data leaves the handle, profile fields and visibility settings intact
- [x] #21 Privacy policy describes the always-visible identity card, what each visibility level exposes, avatar handling and handle retention; terms describe the rules for handles, names, bios and avatars
- [x] #22 CONTEXT.md defines Handle and Profile visibility
- [x] #23 Tests cover handle and text-field validation, case-insensitive uniqueness, concurrent claims, cooldown and grace period (including admin reset), default settings for users without a profile row, and profile removal on each account deletion path
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation plan (draft, awaiting approval)

### 1. Shared validation (`packages/core/src/social.ts`, exported from core index)
- `HANDLE_MIN/MAX`, `HANDLE_RAW_REGEX = /^[A-Za-z0-9_]{3,20}$/` (validated on raw input, then lowercased), `DISPLAY_NAME_MAX = 50`, `BIO_MAX = 160`.
- `validateHandle(raw)`, `validateDisplayName(s)`, `validateBio(s)` returning `{ ok } | { ok: false, reason }` with reasons `too_short | too_long | invalid_chars | control_chars`. Control chars = `\p{Cc}`, bidi overrides = U+202A..U+202E, U+2066..U+2069, U+200E/200F, U+061C.
- Zod schemas for the API bodies: `ClaimHandleBodySchema { handle, name }`, `UpdateProfileBodySchema { name?, bio?, visibility?, showCurrentlyReading?, showFinished?, showStats?, showHighlights? }` (visibility `z.enum(["private","friends"])`), `AvatarSourceBodySchema { source: "account" | "none" }`, and the `OwnSocialProfile` response type (handle, name, bio, avatarUrl, visibility, four section flags, handleChangedAt). Client and server import from here like `sync.ts`.
- Reserved-word list stays server-side only (`apps/web/src/lib/social/reserved-handles.ts`).

### 2. Database (`apps/web/src/db/schema.ts`, migration `apps/web/drizzle/0021_social_identity.sql` via `pnpm db:generate --name social_identity`)
- `social_profile`: `user_id` text PK, FK `user.id` ON DELETE CASCADE; `handle` text null (denormalised copy of the active handle for cheap reads); `handle_changed_at` timestamp null (cooldown); `bio` text null; `visibility` text NOT NULL DEFAULT 'private' CHECK IN ('private','friends'); `show_currently_reading`, `show_finished`, `show_stats`, `show_highlights` boolean NOT NULL DEFAULT true; `updated_at`. No backfill: missing row = defaults. Later tasks add columns here.
- `social_handle`: `handle` text PK (normalised lowercase; this PK is the uniqueness guarantee); `user_id` text null FK `user.id` ON DELETE SET NULL; `claimed_at` timestamp; `released_at` timestamp null; `reclaimable` boolean NOT NULL DEFAULT true. Active row: `released_at IS NULL`. Index on `user_id`.
- `social_avatar`: `id` uuid PK default random (the capability id in the URL); `user_id` text NOT NULL UNIQUE FK `user.id` ON DELETE CASCADE; `data` bytea via drizzle `customType` (drizzle 0.45 has no built-in bytea); `created_at`. Replacing an avatar deletes the old row and inserts a new id, so the URL changes and CDN/browser caches never serve a stale image.
- Add `"social_*"` to `tablesFilter` in `apps/web/drizzle.config.ts`.

### 3. Service module (`apps/web/src/lib/social/profile.ts`, `handle.ts`, `avatar.ts`)
- `getOwnProfile(userId)`: joins `user.name` with the profile row, returns defaults when no row. Explicit allowlist, never spreads `user`.
- `checkHandleAvailability(userId, raw)` and `claimHandle(userId, raw, name)`: validate raw input, lowercase, reject reserved words, then in one transaction `SELECT ... FOR UPDATE` on the handle row. Free when: no row, or `released_at` older than 90 days, or `released_at` set and `reclaimable` and `user_id = me`. Cooldown: refuse when the caller's `handle_changed_at` is younger than 30 days (first claim has no cooldown). On success: mark the caller's previous active row released (`released_at = now`, `reclaimable = true`), upsert the new row as active, upsert the profile row with `handle`, `handle_changed_at`, and update `user.name`. A concurrent insert that loses the PK race surfaces as unique violation 23505 and is mapped to `taken`, so exactly one claim wins (AC #3).
- `updateProfile(userId, patch)`: validates name/bio/visibility, upserts the profile row, updates `user.name` when name is given.
- `forceResetHandle(userId)` (for TASK-171.6): releases the active row with `reclaimable = false`, clears `profile.handle`.
- `releaseHandlesForDeletedUser(tx, userId)`: sets `released_at = now, reclaimable = false` on the user's active handle rows; called from `purgeUserSyncData` so every deletion path reaches it before the FK sets `user_id` to null. Released rows without an owner are blocked for the 90-day grace period and then free.
- Avatar: `setAvatarFromBytes(userId, bytes)`: refuse over 5 MB before decoding, `sharp(bytes, { limitInputPixels: 30_000_000 })`, check `metadata().format` is jpeg/png/webp (not the client content type), `.rotate().resize(256, 256, { fit: "cover" }).webp({ quality: 80 })`; sharp drops EXIF/ICC/XMP unless `withMetadata()` is called. `setAvatarFromAccountPicture(userId)`: fetches `user.image` server-side with a 10 s timeout and the same 5 MB cap, then the same pipeline. `removeAvatar(userId)` deletes the row (also for TASK-171.6). `sharp` moves from devDependencies to dependencies (it is only used by scripts today, and the runner image needs it at runtime; node:22-alpine gets sharp's musl prebuilt binary via pnpm).

### 4. API routes (`apps/web/src/routes/api/social/`), all `middleware: [cors, requireAuth]`, POST for every mutation, rate-limited with `checkLimit`
- `profile.ts`: GET own profile; POST update (name, bio, visibility, section toggles).
- `handle.ts`: POST claim `{ handle, name }`. Key `social-handle-claim:${userId}`, 5 per 10 min.
- `handle.check.ts` (`/api/social/handle/check`): POST `{ handle }` → `{ available, reason }`. Answers only for the given handle, 30 per min.
- `avatar.ts`: POST raw image body (Content-Type image/jpeg|png|webp; the header value is allowed by the existing CORS config). 10 per 10 min.
- `avatar.source.ts` (`/api/social/avatar/source`): POST `{ source: "account" | "none" }`.
- `avatar.$id.ts` (`/api/social/avatar/<uuid>`): GET, **no requireAuth**: an `<img>` in the native app cannot attach a bearer token, so the image is protected by the unguessable uuid instead, with `Cache-Control: public, max-age=31536000, immutable`, `Content-Type: image/webp`. Served from the Lesefluss origin, so the website CSP (`img-src 'self'`) allows it (AC #12). The profile response carries `avatarUrl` as an absolute URL built from the request origin.
- Error bodies: `{ error: string, reason?: string }` with 400/409/429 so clients can show "taken", "reserved", "cooldown", "rate-limited" messages.
- Website account page calls these same `/api/social/*` routes with the session cookie (same origin) through a small `apps/web/src/lib/social-client.ts`. Deviation from the task note ("website server functions call the same service"): no server functions are needed here because the routes already accept the cookie; TASK-171.2 can still add a server function over the service for the invite page.

### 5. Account deletion
- `deleteAdminUser` in `lib/admin.ts` calls `deleteUserAccount(data.userId)` (fixes the glossary/session gap too).
- `purgeUserSyncData` calls `releaseHandlesForDeletedUser`; profile and avatar rows go by cascade.
- `clearCloudData` untouched, so social rows survive it (AC #20); covered by a test.
- Extend `account-deletion.integration.test.ts`: profile + avatar rows gone, handle row kept with `user_id NULL`, `released_at` set, `reclaimable = false`; a third user cannot claim it; `clearCloudData`-equivalent deletes leave social rows intact. The better-auth path runs the same `purgeUserSyncData` in a transaction followed by the user delete, so the test exercises that sequence directly.

### 6. Capacitor app
- Extract `authedFetch(path, init)` into `apps/capacitor/src/services/authed-fetch.ts` (bearer on native, `credentials: "include"` on the web build, 401 → clear token / clear account-scoped state, throws `AuthedFetchError { status, body }`). Token and account-scoped-state helpers move to `services/sync/session.ts` (re-exported from `services/sync/index.ts`) so `authed-fetch` does not import the sync module. `syncFetch` becomes `authedFetch` plus its existing fetch-failure diagnostics and "Sync failed" message.
- `services/social/profile.ts`: API client + TanStack Query hooks (`useOwnSocialProfile` with `staleTime: 0, retry: 1`, `useClaimHandle`, `useUpdateSocialProfile`, `useSetAvatar`, `useRemoveAvatar`, `useCheckHandle`), `socialKeys` in `db/hooks/query-keys.ts`. `SyncContext.logout` removes `socialKeys.all` from the cache.
- `components/social/handle-claim-step.tsx`: reusable claim step. Handle input with debounced availability check and inline reasons (invalid, reserved, taken, cooldown, rate-limited, offline), display-name input prefilled from the profile, identity-card preview (initials avatar, name, @handle) with the text "This is what other users will see", Confirm button. Props: `onClaimed`, optional `onSkip`.
- `routes/tabs/settings/social.tsx`: loading / error-with-retry / no-handle (claim step) / form: identity card, display name, bio (160 chars counter), avatar actions (file input accepting jpeg/png/webp, "Use my account picture" only when the profile says an account picture exists, "Remove"), visibility (private / friends) with plain explanation that the identity card is always visible to friends, four section toggles. Saves per field on blur/change with toasts. Row "Social profile" in `settings/index.tsx` when `isLoggedIn && SYNC_ENABLED`.
- Onboarding `steps/sync.tsx`: when already signed in, render the claim step instead of the sign-in copy, footer "Skip".

### 7. Website account page (`routes/_authenticated/account/index.tsx`)
- New "Social profile" section between Account and Danger zone with the same states and fields as the app screen, using `lib/social-client.ts` and TanStack Query (already provided in `__root.tsx`).

### 8. Legal + glossary
- Privacy: new section "Social profile" (identity card and who sees it, private vs friends, avatar re-encoding without metadata, account picture copied once, legal basis contract, released handle kept 90 days without account link). Bump "Last updated".
- Terms: handle/name/bio/avatar rules under Acceptable use + note that we may reset or remove them.
- `CONTEXT.md`: Handle, Profile visibility (with identity card).

### 9. Tests
- `packages/core/src/__tests__/social.test.ts`: validation rules, Kelvin sign, bidi chars, lengths.
- `apps/web/src/lib/social/handle.integration.test.ts` (DB-gated like the existing one): claim, case-insensitive conflict, concurrent `Promise.all` claims → one success, cooldown, release + reclaim, admin reset blocks reclaim, 90-day expiry (by writing `released_at` in the past), defaults without a row, visibility enum rejection.
- `apps/web/src/lib/social/avatar.test.ts`: sharp pipeline on a generated PNG with EXIF → 256×256 webp, `metadata().exif` undefined; oversize and non-image rejected.
- Type checks: `pnpm check-types` in apps/web, apps/capacitor, packages/core.

### Risks / notes
- `sharp` on alpine: pnpm installs the `@img/sharp-linuxmusl-x64` optional dependency; verify the Docker build.
- `user.name` is shared with the auth display name; editing it in the social settings also changes what better-auth shows (intended: one display name).
- The avatar GET is unauthenticated by design (unguessable uuid); documented in the route.

Approved 2026-09-26: routes-only (no website server functions), unauthenticated avatar GET by uuid, sharp as runtime dependency, user.name shared with auth display name.

Executed as planned with two deviations: the migration `0021_social_identity.sql` and its journal entry are hand-written (the drizzle meta snapshots end at 0002, so `db:generate` opens an interactive rename prompt), and the app's `syncFetch` keeps only its 'Sync failed (status)' message on top of the shared `authedFetch`. Social cache clearing on web-build account switch (`adoptSyncIdentity`) is left to TASK-171.3 as agreed in its scope; sign-out already clears it.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cross-task contracts (from the final review of the TASK-171 set):
- Owns the shared authed-fetch helper extracted from `syncFetch` and the switch of `deleteAdminUser` to `deleteUserAccount` (which also fixes today's gap where admin deletion leaves `sync_glossary_entries` and `sync_reading_sessions` behind). Every later subtask relies on both.
- The claim step is one reusable component plus one claim endpoint. TASK-171.3 embeds the component for its no-handle state, and the TASK-171.2 website invite page uses the same endpoint (through a website server function over the same service) so a brand-new user can claim a handle inline.
- Expose service functions that TASK-171.6 calls: force-reset a handle (the old handle goes into the 90-day hold with reclaim disabled, and the user must pick a new handle before using social features again), and remove the avatar (deletes the stored image). Removing the bio is a plain field update.
- Banned users (`user.banned`) are treated like users without a handle in every read path that returns another user; TASK-171.2 enforces this in requests, invite links and lists through its block-and-ban helper.
- The `social_profile` row is extended by later tasks, each adding its own column and a switch on these settings screens: TASK-171.10 (feed publishing, default on), TASK-117 (profile stat selection and owner time zone). Keep the settings screens easy to extend and the read path tolerant of missing columns (defaults). The row is server-only and never rides `sync_settings`, which every app version pushes whole.

Handle table: the `social_handle` primary key is the uniqueness guarantee; `SELECT ... FOR UPDATE` serialises claims on existing rows and a lost insert race surfaces as pg 23505, mapped to `taken`. Released rows are never deleted; expiry is evaluated lazily on claim (`isHandleFreeFor`). Admin reset clears `handle_changed_at` so the user is not locked out by their own cooldown.

Avatar URLs are capability URLs: `/api/social/avatar/<uuid>` has no auth because a native `<img>` cannot carry a bearer token. Replacing an avatar deletes the old row and mints a new uuid, which is what makes `Cache-Control: immutable` safe. `avatarUrl` is built from `BETTER_AUTH_URL`, not the request URL, because the request URL behind the proxy is internal.

Website reuses the `/api/social/*` routes over the session cookie (`lib/social-client.ts`) instead of server functions; TASK-171.2's invite page can add a server function over `lib/social/handle.ts` if it needs SSR.

Local dev Postgres is behind the schema (sync_books lacks word_position etc.), so integration tests were run against a throwaway database created from the migrations (`create database`, `drizzle-kit migrate`, `pnpm test`), then dropped. The social migration was also applied to the dev DB with psql so the dev server works.

Not verified in a running browser or on a device: the app settings screen, onboarding branch and website section were checked by type-check, lint and tests only. sharp now ships in the runtime image (moved to dependencies; lockfile carries @img/sharp-linuxmusl-x64) but the Docker build was not run.

Review pass (3 fresh-context reviewers + verifier) fixed: SSRF in the account-picture copy (user.image is user-writable via better-auth update-user; now https + googleusercontent.com/cdn.discordapp.com allowlist, redirect manual, and hasAccountPicture reflects the allowlist); chunked uploads bypassing the 5 MB cap (readBodyCapped streams with a running total); avatar Cache-Control now private; better-auth deleteUser hook moved to beforeDelete (afterDelete ran after the FK had nulled social_handle.user_id, leaving the handle blocked forever); avatar GET moved to /api/social/avatar-image/$id and the check/source routes flattened to /handle-check and /avatar-source, because TanStack Start runs a parent route's middleware for every child, which would have put requireAuth on the unauthenticated image GET; claimHandle locks the user row so two concurrent first claims cannot both create an active handle; re-confirming the current handle with a new name now syncs the settings form's name state (a later blur used to save the old name back).

Conventions from the review: shared social error parsing, claim-failure mapping, messages and the availability state moved to packages/core/src/social.ts; SocialAvatar and IdentityCard moved to packages/ui (`@lesefluss/ui/social-avatar`); Tx type exported from ~/db; purgeCloudData shared by clearCloudData and tests; visibility column typed with the enum (no cast); availability check keeps only the async result in state; dead exports removed. Declined: replacing the services/sync barrel re-exports (documented public surface), boolean is/has prefixes (no team rule), moving web hooks out of the component (matches existing web-app practice).

## Corrections after the branch review (2026-09-28)
- **Deletion paths:** better-auth's `/delete-user` and `/admin/remove-user` are disabled (`apps/web/src/lib/auth.ts` `disabledPaths`, TASK-171.13), and there is no `beforeDelete`/`afterDelete` hook. Every account deletion goes through `deleteUserAccount` (the website account page and the admin `deleteAdminUser`). AC #19's "all three deletion entry points" therefore means those two, and any mention of a better-auth delete hook in this task is out of date. `deleteAdminUser` has no test yet (TASK-175.4).
- **Route names:** the final summary and notes list `handle/check`, `avatar/source` and `avatar/$id`. The real file routes are `api/social/handle-check`, `api/social/avatar-source` and `api/social/avatar-image/$id` (TanStack Start flat file names).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Social identity: handles, profile fields, visibility

### What changed
- **Core** (`packages/core/src/social.ts`): handle/name/bio validation shared by client and server (raw `[A-Za-z0-9_]{3,20}` checked before lowercasing, control and bidi characters rejected), Zod body schemas, `OwnSocialProfile` type, `initialsFor`.
- **Database** (`apps/web/src/db/schema.ts`, `drizzle/0021_social_identity.sql`): `social_profile` (cascade FK, visibility CHECK, section toggles default on), `social_handle` (handle PK, owner FK set-null, `released_at`, `reclaimable`), `social_avatar` (uuid id, bytea, cascade). `social_*` added to the drizzle table filter.
- **Service** (`apps/web/src/lib/social/`): `claimHandle` (transactional, `FOR UPDATE`, 30-day cooldown, 90-day hold, reclaim rules, unique violation → `taken`), `checkHandleAvailability`, `forceResetHandle` and `removeAvatar` for TASK-171.6, `releaseHandlesForDeletedUser` (called from `purgeUserSyncData`), `getOwnProfile` with defaults for a missing row, `updateOwnProfile`, avatar pipeline with `sharp` (5 MB cap before decode, format sniffed, 30 MP decode limit, 256px WebP, metadata dropped), account-picture copy with timeout.
- **Routes** (`apps/web/src/routes/api/social/`): `profile` GET/POST, `handle` POST (claim), `handle/check` POST, `avatar` POST (raw bytes), `avatar/source` POST, `avatar/$id` GET (unauthenticated capability URL, immutable cache). All others use `cors` + `requireAuth` and per-user `checkLimit`.
- **Account deletion**: `deleteAdminUser` now calls `deleteUserAccount` (also fixes the glossary/reading-session gap); every path releases the handle before the FK nulls the owner.
- **App**: `services/authed-fetch.ts` extracted from `syncFetch` (token helpers moved to `services/sync/session.ts`), `services/social/profile.ts` query hooks, `components/social/` (avatar, identity card, reusable `HandleClaimStep`), new `settings/social.tsx` screen (loading / error-with-retry / claim / edit), settings row, onboarding sync step shows the claim step when signed in, sign-out drops the social cache.
- **Website**: `lib/social-client.ts` and a "Social profile" section on `/account` with the same states and fields.
- **Legal and glossary**: privacy (identity card, visibility levels, avatar handling, account picture copy, legal basis, 90-day handle hold), terms (rules for handles, names, bios, avatars), `CONTEXT.md` (Handle, Identity card, Profile visibility).
- `sharp` moved from devDependencies to dependencies.

### Tests
- `packages/core`: 13 new validation tests (lengths, chars, Kelvin sign, bidi, trimming, visibility enum). All 96 core tests pass.
- `apps/web`: `social/avatar.test.ts` (resize, metadata stripped, jpeg/webp/gif/garbage/oversize), `social/handle.integration.test.ts` (defaults, claim, case-insensitive conflict, invalid/reserved reasons, concurrent claims → one winner, cooldown, re-confirm, hold + reclaim + expiry, admin reset, visibility CHECK, deletion release), `account-deletion.integration.test.ts` extended (profile/avatar cascade, handle hold blocks others, purge path, clear-cloud-data keeps the profile). All 53 web tests pass against a fresh migrated database.
- `apps/capacitor`: type-check and all 655 tests pass; sync tests cover the refactored fetch path.

### Risks / follow-ups
- UI not exercised in a browser or on a device; Docker build with runtime `sharp` not run.
- Web-build account switch does not yet clear the social query cache (TASK-171.3 owns the social-cache clear).
- TASK-171.2 must gate every other-user read on a non-null handle and `user.banned`; nothing in this task returns other users.

### Review pass
Three fresh-context reviewers plus a verifier. Fixed: SSRF via user-writable `user.image` (provider host allowlist, no redirects), chunked-upload cap bypass (streamed cap), better-auth `beforeDelete` ordering (handle was left permanently blocked), avatar GET moved out of the authed route tree (`/api/social/avatar-image/$id`), user-row lock against concurrent first claims, stale name state after re-confirming a handle, avatar cache made private, nondeterministic deletion test. Shared helpers moved to core and ui. All suites green afterwards: core 96, web 56 (throwaway migrated DB), capacitor 655.
<!-- SECTION:FINAL_SUMMARY:END -->
