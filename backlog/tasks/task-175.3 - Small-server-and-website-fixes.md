---
id: TASK-175.3
title: Small server and website fixes
status: Done
assignee:
  - '@claude'
created_date: '2026-09-28 16:18'
updated_date: '2026-09-28 19:10'
labels:
  - social
  - web
dependencies:
  - TASK-171.5
  - TASK-171.10
  - TASK-171.15
parent_task_id: TASK-175
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Server and website fixes from the branch review.

- **B10, owner time zone for "books finished this year":** the profile stat uses the viewer's device time zone (`apps/capacitor/src/services/social/profile-view.ts` sends `deviceTimeZone()`). TASK-171.5 AC #24 and the test name ("the year boundary follows the owner's time zone") say it should be the owner's.
  - **Decision:** store the owner's IANA time zone server-side as `social_profile.time_zone` (nullable text, validated with `validTimeZone`, hand-written migration).
  - The owner's app writes it: once on each profile fetch or social settings open when the device zone differs from the stored value, through the existing profile update endpoint, which gains an optional `timeZone` field.
  - `resolveProfileView` uses the owner's stored zone for the stats year and falls back to UTC when none is stored. The viewer's `tz` parameter is still used only for viewer-relative labels (for example "Today" and "Yesterday" in the feed).
  - The stored zone is never returned to other users. The privacy paragraph for the social profile mentions it.
  - TASK-117 (share stats) reuses the same column.
- **B8:** `feed-delete` shares the `social-feed` rate-limit key with the GET feed, so deleting spends the reading budget. It gets its own key.
- **T10:** the website's social profile section (`apps/web/src/components/social-profile-section.tsx`) has no toggles for "Share my reading activity in friends' feeds" or "Share live reading activity"; the app settings have both. The website gets them, with the same confirmation for turning off feed sharing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 social_profile.time_zone exists (hand-written migration), is set from the owner's device through the profile update endpoint only when it changes, is validated, and is never returned to other users
- [x] #2 Books finished this year on a friend's profile uses the owner's stored time zone, falling back to UTC; the integration test named for the owner's time zone asserts that and no longer depends on the viewer's tz
- [x] #3 The privacy policy's social profile paragraph says the time zone is stored and used only for the owner's stats
- [x] #4 feed-delete uses its own rate-limit key and bucket; GET feed keeps social-feed
- [x] #5 The website social profile section has the feed-sharing toggle (with the same delete-on-off confirmation as the app) and the live-reading toggle, and both persist through the existing profile endpoint
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Plan
- **B10, schema:**
  - Hand-written migration `0031_owner_time_zone.sql`: `ALTER TABLE social_profile ADD COLUMN time_zone text`.
  - Journal entry idx 31, with `when` after 0030.
  - `schema.ts` gains `timeZone: text("time_zone")`.
- **B10, core:**
  - `UpdateSocialProfileBodySchema` gains optional `timeZone` (string, at most 64 characters).
  - `OwnSocialProfile` gains `timeZone: string | null`. This is the owner's own profile response only, so the app can compare it with the device zone.
- **B10, server:**
  - `updateOwnProfile` checks `timeZone` with `validTimeZone` and throws `SocialError("invalid")` when it is unknown.
  - `getOwnProfile` returns it.
  - `resolveProfileView` reads the owner's `social_profile.time_zone`, already loaded as `profile`, and uses it both for the stats year boundary and for the finished-on day labels. Both are the owner's own dates; UTC is the fallback.
  - The viewer's `tz` is then unused in the profile view, so it goes away end to end: the `timeZone` option on `ProfileViewOptions`, the `tz` parameter in `routes/api/social/profile-view.ts`, and the `tz` the app sends from `services/social/profile-view.ts`.
  - The feed keeps its viewer `tz` for its viewer-relative "Today" and "Yesterday" labels (`deviceTimeZone` stays exported for it).
  - No response to other users serialises `social_profile` whole: every read is an explicit select, or builds its response field by field (checked with grep: `profile-view.ts`, `feed.ts`, `live.ts`, `invite.ts`, `handle.ts`, moderation targets).
- **B10, app:** `useOwnSocialProfile` sends `updateProfile({ timeZone })` once per session when the loaded profile's `timeZone` differs from `deviceTimeZone()`, from the owner's device, through the existing endpoint.
- **B10, privacy:** in the social profile paragraph, the time zone is stored and used only to count the owner's own "this year" stats and dates, and it is never shown to others.
- **B8:** `feed-delete` uses its own key, `social-feed-delete`, at 60 per minute (deleting is rare). GET feed keeps `social-feed` at 120 per minute.
- **T10, website:** `components/social-profile-section.tsx` gets two new toggles, using the existing `ToggleRow` and `save` pattern and the existing profile endpoint:
  - an "Activity feed" toggle ("Share my reading activity in friends' feeds"). Turning it off asks for confirmation first, in an `AlertDialog` from `@lesefluss/ui` with the app's wording; the server already deletes the events when it goes off;
  - a "Buddy reads" toggle ("Share live reading activity"), with no confirmation, as in the app.
- **Tests** (throwaway database):
  - `profile-view.integration.test.ts` "the year boundary follows the owner's time zone": the owner's stored zone is `Pacific/Kiritimati` (UTC+14), a book is finished on 2025-12-31T11:00Z, which is already 2026-01-01 there, and "now" is early January 2026. The stat counts it as this year's for the owner. The old code, with no viewer `tz` passed, used UTC and would not count it.
  - A never-leaked test: the owner's zone string does not appear in the friend's profile-view, relationships or feed JSON.
  - Profile update: an invalid zone is rejected, and a valid one is stored and returned by `getOwnProfile`.
  - `feed-delete` bucket: a route-level check that the feed route and the feed-delete route declare different keys; the factory's own tests already cover per-key buckets.
  - Website toggles: `apps/web` has no component-test setup for the account page, so they are covered by the typecheck and the manual pass, and noted as such.
- **Verify:** web tsc, the full web suite on a throwaway database, Biome; capacitor `pnpm check-types`; core tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implementation (2026-09-28)
- **B10, schema:** migration `0031_owner_time_zone.sql` (hand-written) adds `social_profile.time_zone text`, with journal idx 31 and `schema.ts` `timeZone`. Applied to the dev database (psql) and the phone database (drizzle-kit migrate).
- **B10, server:**
  - Core `UpdateSocialProfileBodySchema` gains optional `timeZone` (at most 64 characters), and `OwnSocialProfile.timeZone` is returned to the owner only.
  - `updateOwnProfile` rejects an unknown zone (`validTimeZone`) with `invalid`.
  - `resolveProfileView` uses the owner's stored zone for the stats year and for the finished-on dates (both are the owner's own dates), with UTC as the fallback.
  - Nothing viewer-relative remained in the profile view, so the viewer's `tz` is removed end to end: `ProfileViewOptions.timeZone`, the `tz` query parameter in `api/social/profile-view.ts`, and the `tz` the app sent from `services/social/profile-view.ts`.
  - The feed keeps the viewer's `tz` for "Today" and "Yesterday".
- **B10, app:** `getOwnProfile` (`services/social/profile.ts`) compares the loaded profile's `timeZone` with `deviceTimeZone()`. When they differ it posts `{ timeZone }` to the profile endpoint and uses the returned profile; a failure falls back to the fetched one.
- **Never leaked:** grep confirms every read of `social_profile` that reaches another user either selects explicit columns (`handle`, `bio`, flags) or builds the response field by field. The whole rows loaded in `profile-view.ts` and `feed.ts` are never serialised.
- **B8:** `FEED_READ_LIMIT` (`social-feed`, 120 per minute) and `FEED_DELETE_LIMIT` (`social-feed-delete`, 60 per minute; deletes are rare) are exported from `lib/social/feed.ts` and used by both routes.
- **T10, website:** `social-profile-section.tsx` gains an Activity group with "Share my reading activity in friends' feeds" and "Share live reading activity in buddy reads", using the existing `ToggleRow`, `save` and profile endpoint. Turning feed sharing off first opens an `AlertDialog` (`@lesefluss/ui/alert-dialog`) with the app's wording; the server deletes the events when it goes off.
- **Privacy:** a "Time zone" item in the Social profile section.

## Verification
- Web `npx tsc --noEmit` is clean, and Biome is clean.
- Throwaway database (create, `drizzle-kit migrate`, drop): `profile-view.integration.test.ts` plus `http.test.ts` 16 of 16; the full `pnpm test` 212 of 212 in 25 files.
  - "the year boundary follows the owner's time zone" is rewritten: owner zone Pacific/Kiritimati, a finish at 2025-12-31T11:00Z, now 2026-01-02. It expects 0 without a stored zone and 1 with it, and the finished-on date 2026-01-01. It would fail on the old code, where the stat followed the viewer's `tz` or UTC.
  - New: "the owner's time zone is validated, readable by the owner and shown to nobody else". An invalid zone is rejected, `getOwnProfile` returns the zone, and the friend's profile-view, relationships and feed JSON do not contain it.
  - New in `http.test.ts`: "deleting feed events does not spend the feed-reading budget", which exhausts the delete bucket and still reads with 200.
- Core: 130 tests; typecheck clean.
- Capacitor `pnpm check-types`: clean, 681 of 681.
- **Left unchecked, AC #5 (the website toggles):** implemented and type-checked, but `apps/web` has no component-test setup for the account page and they were not clicked in a browser. Pending the manual pass.

## AC #5 verified in a browser (2026-09-28, TASK-175.5)
`apps/capacitor/e2e-app/website-social-toggles.spec.ts` covers it on the production website /account page, signed in as a seeded user.
- Switching live reading off persists across a reload.
- Switching feed sharing off opens "Stop sharing your reading activity?". Cancel keeps it on, including after a reload. "Stop sharing" switches it off, and that persists across a reload.
- **Mutation checks:** turning the feed off without the confirmation fails the spec, and so does a live toggle that never saves.
- The spec passed in both full runs.

Final review follow-up: owners on older app builds never store a time zone, so their profile dates fell back to UTC instead of the viewer's zone as before. The profile-view route reads the viewer's `tz` param again (validated with validTimeZone) and passes it as `fallbackTimeZone`; resolveProfileView uses it only while the owner has no stored zone, and the stored zone always wins. The app sends `tz` again. The year-boundary integration test covers both: fallback used without a stored zone, ignored once one is stored. AC #2's "no longer depends on the viewer's tz" now holds only for owners who have a stored zone.
<!-- SECTION:NOTES:END -->
