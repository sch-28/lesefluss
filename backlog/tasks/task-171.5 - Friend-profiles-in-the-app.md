---
id: TASK-171.5
title: Friend profiles in the app
status: Done
assignee:
  - claude
created_date: '2026-09-25 22:10'
updated_date: '2026-09-26 17:54'
labels:
  - social
  - web
  - app
milestone: m-6
dependencies:
  - TASK-171.1
  - TASK-171.2
  - TASK-171.3
parent_task_id: TASK-171
priority: medium
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Let friends see who someone is and what they read. Profiles are friends-only and render only in the app (native and the app's web build); there is no public or website profile. Supersedes archived TASK-60.

Depends on TASK-171.1 (identity card, profile fields, visibility, section toggles), TASK-171.2 (block-and-ban and friends helpers, friendship `accepted_at`, remove and block actions) and TASK-171.3 (Social tab and the in-app profile route stub). TASK-164.3 (book edit sheet) and the TASK-159 stats are Done. The Report action on profiles is added by TASK-171.6, which depends on this task.

Scope:
- **Profile view API**: given a target user id, return what the signed-in viewer may see, resolved server-side from (profile visibility × section toggle × viewer relation: self / friend / stranger / blocked). Visibility is `private` or `friends`. Strangers, a block in either direction, a banned owner, an owner without a handle and a deleted account all get the same "not found" result as a non-existent user. Signed-out callers are rejected.
- **Header and bio**: the header is the TASK-171.1 identity card (handle, display name, avatar) plus friends-since. The bio and friend count are gated like sections: shown to friends only when visibility is `friends`.
- **Who sees what** (decided defaults):
  - Self: everything, regardless of toggles.
  - Friend, `friends` profile: header, bio, friend count and each toggled-on section.
  - Friend, `private` profile: header (identity card and friends-since) only.
  - Stranger or blocked, any profile: not found.
- **Sections** (data already in `sync_books` and `sync_reading_sessions`):
  - Currently reading: books whose `bookStatus()` (`packages/core/src/books.ts`) is `reading`, with title, author and progress rounded to a whole percent.
  - Finished: books whose `bookStatus()` is `finished`, with finish date (day only) and rating (half-stars, 1-10). Review text is never shown. `want` and `dropped` are not shown in this first cut.
  - Stats: books finished this year, words read, reading time and reading speed, with the app's metric definitions (TASK-159); the raw `wpm_avg` column is never headlined as a speed. Aggregates only; never individual sessions, timestamps or per-day activity. TASK-117 later narrows which stats appear and adds an optional streak.
  - Articles imported by URL (`source = 'url'`) never appear in the book lists (they reveal browsing, as in TASK-171.10) but count in the aggregate stats.
  - The resolver treats sections as an extensible list, so TASK-61 adds "shared highlights" (toggle already in TASK-171.1) without changing the matrix.
- **Covers**: catalog covers (`catalogId`) come through the catalog cover proxy (`apps/catalog/src/routes/covers.ts`). User-uploaded covers (`sync_books.cover_image`) and serial covers (`sync_series.cover_image`) are served by a friends-only cover route (`/api/social/cover/...`, same origin, block-and-friend checked, cacheable per URL) that TASK-171.10 reuses. Covers are never inlined as base64 in list responses.
- **Hide from profile**: a per-book flag (default off) that rides the book metadata sync (`metadata_updated_at` last-write-wins, TASK-164.1 / TASK-164.10), toggled in the book edit sheet (TASK-164.3). A hidden book is excluded from every section and from the stats totals (its sessions are dropped by `book_id`). The flag is private: a shared copy (TASK-171.7) starts visible.
- **In-app profile screen** (fills the TASK-171.3 stub; reached from the friend list, the social inbox, the activity feed and buddy-read participant lists). A friend's profile shows the "Friends" state, with Remove friend and Block in the overflow menu, next to where TASK-171.6 adds Report. Your own profile links to profile settings. A buddy-read co-participant who is not a friend has no profile to open; the friend-request action for them lives in TASK-171.8.
  - States: loading; offline or error with retry; not found (also for strangers, blocked, banned, deleted); an allowed but empty section shows a short empty state; a hidden section is omitted.
  - A signed-out app user gets a sign-in prompt instead of a profile.
- **Own profile preview**: "view as friend" in settings, calling the server resolver with a simulated friend relation.
- **Privacy policy**: which reading data friends see at each visibility level and section toggle, and the hide flag. TASK-171.1 covers the profile fields.

Out of scope: highlights on profiles (TASK-61), stat selection (TASK-117), activity feed (TASK-171.10), Report action and notice form (TASK-171.6), the own dashboard at `apps/web/src/routes/_authenticated/profile/` (TASK-160).

Implementation notes:
- **Two clients, one API.** An `apps/web/src/routes/api/...` handler with `cors` and `requireAuth`, called through TASK-171.1's authed-fetch helper, so it works with a bearer token on native and a session cookie on the web build. Rate-limit with `checkLimit`, keyed by user id.
- **Allowlist and caching.** Explicit field allowlist; never raw `sync_books` or `user` rows, email, review, notes, tags or exact word position. `Cache-Control: private, no-store` on the API.
- **Stats in core.** `getProfileStats` in `apps/web/src/lib/profile.ts` covers only the caller. Reading time and speed exist only in `apps/capacitor/src/services/stats/aggregate.ts` (`summariseReadingRates`, `isPlausibleRate`, `MAX_PLAUSIBLE_WPM`, `rollUpWorks`). Move the pure pieces into `@lesefluss/core`, add one measured reading-speed function (words over active time across plausible sessions, one number, labelled "reading speed"), and write a server helper keyed by a target `userId` that takes an optional owner time zone ("this year" in UTC when absent; TASK-117 supplies the zone). TASK-160, TASK-117 and TASK-171.12 reuse these.
- **Missing data is not zero.** With no synced sessions (`syncStats` off, oversized books local-only per ADR-0003), hide time and speed instead of showing zeros.
- **Serial chapters.** Roll up `sync_books` rows with `series_id` to one entry per series (title and author from `sync_series`). Exclude tombstoned rows everywhere.
- **Hide flag and the merge.** Postgres column on `sync_books` plus migration; SQLite column on `books` (`apps/capacitor/src/services/db/schema.ts`) plus migration in `apps/capacitor/drizzle/`; optional `SyncBookSchema` field; push and pull in `apps/capacitor/src/services/sync/index.ts`; merge rules in `apps/web/src/lib/sync-book-upsert.ts`. Do not just append it to `METADATA_FIELDS`: `claimsMetadata` is true when any metadata field is present, so an older client sending `status` without the flag would clear it. Absent = keep server value; present = gated by the metadata revision; cleared on tombstone.
- **Identity.** Look profiles up by user id, never by handle; the handle is only displayed. **Friend count** counts accepted friendships and excludes blocked pairs.

Docs: the profile view API, the visibility matrix and the hide flag in the developer docs; "hide from profile" in CONTEXT.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Viewing a friend's profile in the app shows the header plus only the sections their visibility and section toggles allow; a private profile shows friends the header only
- [x] #2 A stranger, a block in either direction, a banned owner, an owner without a handle and a deleted account all give the same not-found result as a non-existent user
- [x] #3 There is no public profile: no public visibility option, no website profile page, and signed-out callers of the profile API are rejected
- [x] #4 Catalog-resolved covers come through the catalog cover proxy; user-uploaded and scraped serial covers are shown to friends only
- [x] #5 A user can hide an individual book from their profile, and that flag syncs across their devices
- [x] #6 Books hidden from profile never appear in any profile section for any viewer and are not counted in the profile stats
- [x] #7 Review text, notes, tags, exact word positions, individual reading sessions and email are never exposed by the profile API
- [x] #8 A user can preview their own profile as a friend would see it, and the preview matches what a real friend receives
- [x] #9 A friend's profile shows the Friends state with Remove friend and Block in the overflow menu
- [x] #10 The profile screen shows distinct loading, offline/error with retry, not-found and empty-section states
- [x] #11 A signed-out app user sees a sign-in prompt instead of a profile
- [x] #12 Pushing a book from an app build that predates the hide-from-profile flag, including builds that send other metadata fields such as status or rating, never clears a flag set on another device
- [x] #13 A web serial appears on a profile as one entry per series, never one entry per chapter, and deleted books never appear
- [x] #14 Time and speed stats are hidden, not shown as zero, when the owner has no synced reading sessions; speed uses the app's metric definition, not the raw wpm_avg column
- [x] #15 Profile API responses are sent with Cache-Control private, no-store, and profile lookups are rate-limited per user
- [x] #16 The profile API works for the native app with a bearer token and for the web build with a session cookie
- [x] #17 The privacy policy describes which reading data friends see at each visibility level and section toggle, and the hide-from-profile flag
- [x] #18 Tests cover the visibility matrix (self, friend, stranger, blocked × private, friends × each section toggle)
- [x] #19 Tests cover the hide-flag merge (absent field keeps the server value, older stamp loses, tombstone clears it), hidden-book exclusion from stats, and serial roll-up
- [x] #20 Developer docs describe the profile view API, the visibility matrix and the hide-from-profile flag
- [x] #21 The bio and friend count follow profile visibility like sections: on a private profile a friend sees only the identity card and friends-since
- [x] #22 Articles imported by URL never appear in the currently-reading or finished sections
- [x] #23 User-uploaded and serial covers reach friends only through a same-origin friends-only cover route that checks friendship and block state, and are never inlined as base64 in API responses
- [x] #24 Reading speed comes from a single measured-speed function in @lesefluss/core, and the server stats helper accepts an optional owner time zone and falls back to UTC
- [x] #25 Profiles are looked up by user id; the handle is displayed but never used as a lookup key or in a URL
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation plan

### 1. Core (`packages/core/src/`)
- `reading-rates.ts`: move the pure pieces out of `apps/capacitor/src/services/stats/aggregate.ts`: `MIN_MEASURABLE_MS`, `MAX_PLAUSIBLE_WPM`, `DEFAULT_RSVP_DELIVERED_RATIO`, `isPlausibleRate`, `RateSession` / `ReadingRates` / `summariseReadingRates`, `BookTotals` / `WorkTotals` / `rollUpWorks`, plus one new `measuredReadingSpeed(rows)` (words over active time across plausible sessions, one rounded wpm or null). `aggregate.ts` and its callers (`records.ts`, `queries/stats.ts`, `reader/index.tsx`, `aggregate.test.ts`) import from core; tests for the moved functions move to `packages/core/src/__tests__/reading-rates.test.ts`.
- `social.ts`: `SOCIAL_API.profileView`, `SOCIAL_API.coverImage`; `ProfileView` type: `{ header: { identity, friendsSince: number | null, relation: "self" | "friend" }, bio?: string | null, friendCount?: number, sections: { currentlyReading?: ProfileBook[], finished?: ProfileFinishedBook[], stats?: ProfileStats } }` where `ProfileBook = { key, title, author, progressPercent, cover: { kind: "catalog", catalogId } | { kind: "url", url } | null }`, `ProfileFinishedBook = { key, title, author, finishedOn: string (YYYY-MM-DD) | null, rating: number | null, cover }`, `ProfileStats = { booksFinishedThisYear, wordsRead, readingTimeMs: number | null, readingSpeedWpm: number | null }`. `PROFILE_SECTIONS` registry (`currentlyReading`, `finished`, `stats`, later `sharedHighlights`) mapping to the visibility toggle column.
- `sync.ts`: `SyncBookSchema.hideFromProfile: z.boolean().optional()` (absent = client predates it).

### 2. Hide-from-profile flag
- Postgres: `sync_books.hide_from_profile boolean not null default false` (`0024_hide_from_profile.sql`). `bookInsertValues` maps `book.hideFromProfile ?? false`; the flag gets its own merge rule (not in `METADATA_FIELDS`): payloads are grouped by `claimsMetadata` × `claimsHideFlag`, and the set for a claiming payload is `CASE WHEN deleted THEN false WHEN metadata revision newer THEN excluded ELSE stored END`, for a non-claiming one `CASE WHEN deleted THEN false ELSE stored END`. `routes/api/sync.ts` groups with a `bookUpsertSetFor(book)` helper. Integration tests: absent field keeps the server value (even with `status` present), older stamp loses, newer wins, tombstone clears.
- SQLite: `books.hide_from_profile integer boolean default 0` (`0033_hide_from_profile.sql` + journal), `METADATA_COLUMNS` gains it (so an edit stamps `metadataUpdatedAt`), `bookToSync` sends it with the metadata block, `buildBookMergeUpdate` applies it when defined, `addServerBookWithContent` maps it. Book edit sheet: "Hide from profile" switch in `BookEditValues` / `bookToEditValues` / `editValuesToPatch`, with the copy "Friends won't see this book on your profile or in your stats".

### 3. Server (`apps/web/src/lib/social/profile-view.ts`, `profile-stats.ts`, `cover-token.ts`)
- `resolveProfileView(viewerId, targetId, { asRelation? })`: relation = self / friend (via `areFriends`) / else `not_found` (strangers, blocks, banned, handle-less, deleted all collapse). Header always (identity + `friendsSince` from `social_friendship.accepted_at`). Bio, friend count and sections only when `visibility = friends` (or self). Each section additionally requires its toggle (self ignores toggles). `asRelation: "friend"` lets the owner preview: same resolver with the owner as viewer and relation forced to friend (toggles honoured).
- Section data from `sync_books` (not deleted, not hidden, `source <> 'url'`), serial chapters rolled up per series (title/author/cover from `sync_series`): currently reading (`bookStatus` = reading, progress rounded), finished (`bookStatus` = finished, `finished_at` day, rating). Stats (`profile-stats.ts`, keyed by userId, optional IANA time zone, UTC fallback): books finished this year, words read (sum of `word_position` for non-hidden books), reading time and `measuredReadingSpeed` from `sync_reading_sessions` excluding hidden books' sessions; time and speed are null when there are no sessions. Articles count in stats but never in lists. Explicit allowlist, no review / notes / tags / exact position / email.
- Covers: catalog books return `{ kind: "catalog", catalogId }` and the app builds the proxy URL as it does today; uploaded book covers and serial covers return `{ kind: "url", url }` where the URL is `/api/social/cover-image/<token>`, an HMAC-signed capability (payload: viewer, owner, kind, id, expiry 1 h; key `BETTER_AUTH_SECRET`) because an `<img>` on native cannot send a bearer token. The route verifies the signature and expiry and re-checks `areFriends`/self at serve time, then streams the stored data URL as an image with `Cache-Control: private, max-age=3600`. Never inlined as base64 in the JSON.
- Routes: `GET /api/social/profile-view?userId=…&as=friend` (`cors` + `requireAuth`, `checkLimit` 120/min, `Cache-Control: private, no-store`), `GET /api/social/cover-image/$token` (no session; token-checked).

### 4. App
- `services/social/profile-view.ts`: `useProfileView(userId, { as })` under the `social` prefix. `pages/social/profile.tsx` + route `routes/tabs/social/profile.$userId.tsx` behind `SocialGate`: header (identity card, "Friends since …" or "You"), bio, friend count, sections with empty states, hidden sections omitted, cover via `getCoverUrl` for catalog or the signed URL; overflow menu with Remove friend / Block (same confirmations as the Social tab) for friends, "Profile settings" for self; loading / offline-retry / not-found states. Friend rows and inbox actor rows link to the profile. Settings screen (`settings/social.tsx`) gets "Preview as a friend" linking to `/tabs/social/profile/$userId?as=friend` for the own id (own user id from the profile response: `OwnSocialProfile` gains `userId`).

### 5. Docs, privacy, tests
- Privacy: what friends see per visibility level and toggle, and the hide flag. `CONTEXT.md`: Hide from profile. `docs/social-profiles.md`: profile view API, visibility matrix, hide flag and merge rule, cover tokens.
- Tests: core `reading-rates.test.ts` (moved + `measuredReadingSpeed`); web `profile-view.integration.test.ts` (matrix self / friend / stranger / blocked × private / friends × toggles, not-found parity for banned / handle-less / unknown, hidden book excluded from lists and stats, articles excluded from lists, serial roll-up, tombstones excluded, no-sessions hides time and speed, preview equals friend view, allowlist has no review/tags/email); `sync-book-upsert.integration.test.ts` hide-flag cases; capacitor `book-merge.test.ts` hide flag on pull; cover token sign/verify unit test.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hide flag merge: `bookUpsertSetFor(book)` picks the metadata rule from `claimsMetadata` and the flag rule from `claimsHideFlag`, and `groupBooksByMergeRules` splits a push into up to four groups so each batch shares one set clause. The flag is cleared with the tombstone. Local side: `hideFromProfile` joined `METADATA_COLUMNS` so an edit stamps `metadataUpdatedAt`; `bookToSync` sends it with the metadata block (omitted on tombstones), `buildBookMergeUpdate` applies it when defined.

Covers on the profile: catalog books return `catalogId` and the app builds the catalog proxy URL with the existing `getCoverUrl`; uploaded and serial covers return a signed `/api/social/cover-image/<token>` URL (HMAC-SHA256 over viewer, owner, kind, id, 1 h expiry, key `BETTER_AUTH_SECRET`) because an `<img>` on native cannot send a bearer token; the route re-checks friendship (or self) at serve time so a block cuts access at once. No separate block check in the resolver: a block deletes the friendship in the same transaction, so a live friendship row proves no block.

Serial roll-up: one entry per series, progress from summed chapter counts, finished only when every chapter is finished and none is in progress. Reading-rate helpers moved into `packages/core/src/reading-rates.ts` with their tests (capacitor suite shrank by 11, core grew by 16 including `measuredReadingSpeed`). The profile resolver reads the viewer's IANA zone from the `tz` query parameter (the app sends `Intl` zone) and falls back to UTC. UI not exercised in a browser or on a device; migration 0024 applied to the dev DB.

## Review pass (combined with 171.4; five sonnet reviewers, every claim verified by hand)

Confirmed and fixed:
- `resolveProfileView` ran an extra friendship query only on the stranger path, so response time could tell a caller whether the target exists or is someone's friend. Both queries now run unconditionally in parallel and every `not_found` path does the same work.
- `mayViewCover` checked the friendship only; a banned or handle-less party could still fetch covers through a live token. It now requires both users to be socially visible. Test added.
- `GET /api/social/cover-image/$token` had no rate limit and runs without a session; now 600/min per client IP (`getClientKey`).
- An invalid `tz` made `Intl.DateTimeFormat` throw a `RangeError` (500). The route validates the zone and falls back to UTC.
- Stray `// JSON: [...]` comment on `hideFromProfile` in the web schema moved back to `tags`.
- `profile-view.integration.test.ts` set env vars in the `describe` body; moved into `beforeAll`. Unused import removed.
- Docs: `social-profiles.md` mentions the visibility re-check, IP rate limit and the tz fallback.

Not changed: `groupBooksByMergeRules` order for duplicate bookIds in one payload (the client never sends duplicates; each group's SQL references only `excluded.*`, so order does not change the result). Correctness reviewer found no defects.

Verification after fixes: web 99/99 on a fresh migrated database, core 112/112, capacitor 662/662 with `pnpm check-types` clean, biome clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Friend profiles in the app

### What changed
- **Core**: `reading-rates.ts` (moved `isPlausibleRate`, `summariseReadingRates`, `rollUpWorks` and constants out of the app; new `measuredReadingSpeed`), `ProfileView` / `ProfileBook` / `ProfileFinishedBook` / `ProfileStats` / `ProfileCover` types, `PROFILE_SECTIONS` toggle map, `OwnSocialProfile.userId`, `SyncBookSchema.hideFromProfile`, `SOCIAL_API.profileView` / `coverImage`.
- **Hide from profile**: `sync_books.hide_from_profile` (`0024`) and `books.hide_from_profile` (`0033`), own merge rule (`bookUpsertSetFor`, `groupBooksByMergeRules`, `claimsHideFlag`), pushed with the metadata block, applied on pull, mapped on server-book materialisation, switch in the book edit sheet.
- **Server** (`lib/social/`): `profile-view.ts` (`resolveProfileView`: self / friend / not-found; visibility × toggles; bio and friend count gated like sections; shelves with serial roll-up, articles and hidden/deleted rows excluded; `mayViewCover`), `profile-stats.ts` (`profileStatsFor` keyed by user, hidden books and their sessions excluded, time and speed null without sessions, `startOfYear` with optional zone), `cover-token.ts` (signed viewer-bound cover URLs). Routes: `GET /api/social/profile-view` (cors + requireAuth, 120/min, `private, no-store`, `as=friend` only for self, `tz`), `GET /api/social/cover-image/$token` (token + friendship check, serves the stored data URL).
- **App**: `services/social/profile-view.ts` hook, `pages/social/profile.tsx` + route `/tabs/social/profile/$userId` (`?as=friend` preview) behind `SocialGate`: header with identity card and friends-since, bio, friend count, sections with empty states and hidden sections omitted, covers via catalog proxy or signed URL, overflow menu with Remove friend / Block (confirmations say not notified), Profile settings link for self, loading / offline-retry / not-found states. Friend rows and inbox actors who are friends link to the profile; "Preview as a friend" in the social settings.
- **Docs**: `docs/social-profiles.md` (API, visibility matrix, hide flag, cover tokens), privacy paragraph on what friends see and the hide flag, `CONTEXT.md` Hide from profile (plus the Inbox entry and privacy paragraph TASK-171.4 had failed to write).

### Tests
- Core `reading-rates.test.ts` (moved suites + `measuredReadingSpeed`). Web `profile-view.integration.test.ts` (friend sees everything with exact stats and no leaks, private shows header only, toggles hide sections for friends but not the owner, preview equals friend view, not-found parity for stranger / block / banned / handle-less / unknown / handle-less viewer, no sessions hides time and speed, year boundary follows the zone, cover tokens), `sync-book-upsert.integration.test.ts` (flag kept by pushes without it including ones with `status`, revision-gated merge, tombstone clears), capacitor `book-merge.test.ts` (flag applied / left alone). Web 99 green on a fresh migrated DB, core 112, capacitor 662, type-check and lint clean.

### Follow-ups
- UI not run in a browser or on a device. TASK-61 adds `sharedHighlights` to `PROFILE_SECTIONS`; TASK-117 supplies the owner time zone.
<!-- SECTION:FINAL_SUMMARY:END -->
