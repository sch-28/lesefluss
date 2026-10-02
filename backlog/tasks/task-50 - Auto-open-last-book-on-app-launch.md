---
id: TASK-50
title: Auto-open last book on app launch
status: In Progress
assignee: []
created_date: '2026-04-26 15:59'
updated_date: '2026-10-02 17:44'
labels: []
milestone: m-13
dependencies: []
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Toggle in settings.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 New persisted device-local setting `autoOpenLastBook` (default off) with a migration, toggled from the Settings hub (Reading section)
- [x] #2 With it on, a launch at `/` opens the most recently read non-deleted book (serial chapters included) in the reader, with the library underneath so back returns to the library
- [x] #3 Unfinished onboarding still goes to onboarding; nothing read yet, or a failed lookup, falls back to the library
- [x] #4 A deep link or share intent that navigates away from `/` before the lookup finishes is not overridden
- [x] #5 Unit tests cover the launch decision and the last-read query
- [x] #6 Serial chapters are chosen by their newest reading session (fetched chapters only), not by `lastRead`, which chapter fetches also stamp
- [x] #7 A cold start carrying an intent (App Link, OAuth callback, Open-with file, share-sheet payload) never auto-opens the reader
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Column `auto_open_last_book` in drizzle/0036_launch_and_page_turn.sql; `DEFAULT_SETTINGS.AUTO_OPEN_LAST_BOOK`. New query `getLastReadBookId()` (`services/db/queries/last-read.ts`, registered in `queries`). Pure `resolveLaunchRoute()` in `services/launch-route.ts`. `routes/index.tsx` resolves the route, then bails if the effect was cancelled or `router.state.location.pathname !== "/"` (basepath is stripped by the router, so this holds on web). For the reader it does `navigate(/tabs/library, replace)` then pushes `/tabs/reader/$id`, the same two-step as `navigateToLink`. Links that arrive after the reader opens just navigate on top of it. The reader mounts once, and its `userMovedRef` guard keeps an untouched auto-open from bumping `lastRead`. Tests: `launch-route.test.ts` (4), `db/__tests__/last-read.test.ts` (3, real SQLite through the migrations). Not verified on device: cold-start share intent / App Link racing the lookup.

Review fixes: (1) `getLastReadBookId` ranks standalone books by `lastRead` and serial chapters by MAX(reading_sessions.ended_at), with chapter_status='fetched' and not deleted. `commitChapter` stamps `lastRead` on every fetch, including locked/error and download-all, so it can't rank chapters. Tests: 7 in `db/__tests__/last-read.test.ts`, including a fetched-but-unread chapter that has the newest lastRead. (2) New `services/launch-intent.ts`: `launchHasIntent()` returns true for a non-null `App.getLaunchUrl()` (App Link, lesefluss://auth-callback, Open-with) or when `ShareIntentHandler` has called `markShareReceived()`. That relies on the share listener subscribing before this check runs and on Capacitor answering native calls in order, so a retained cold-start share arrives before getLaunchUrl resolves. Not verified on device. `resolveLaunchRoute(settings, { getLastReadBookId, launchHasIntent })` sends an intent launch to the library. (3) `routes/index.tsx` checks `router.latestLocation.pathname`.

Lead verification 2026-10-02: independent review findings fixed (last-read pick ignores chapter fetch stamps and ranks serial chapters by reading sessions; launches carrying an App Link, auth callback, Open-with file or share intent go to the library; router.latestLocation check). Unit tests 17/17, e2e onboarding / position-back-to-library / position-restore / library-sort pass. Remaining before Done, on a device: (1) cold-start share of an EPUB with the setting on lands in the library with the staging sheet, not in the last book (relies on the share event reaching JS before getLaunchUrl resolves; fallback is a native hasPendingShare()); (2) auto-open into page mode then immediate back: position not clobbered (BookReader double-mount pattern); (3) hardware back from the library after auto-open: pre-existing issue that the app cannot be exited with back (hardware-back.tsx uses history.length) becomes visible on every launch.

Device bug fixed 2026-10-02: with auto-open on, back from the reader returned straight into the reader. Cause: the replace to /tabs/library and the push of the reader ran in one tick; TanStack batched them, the replace wrote no URL, so "/" stayed under the reader, back popped to "/" and RootRedirect auto-opened again. Fix in routes/index.tsx: await the library navigation before pushing the reader, and auto-open at most once per app launch (module flag), so any later visit to "/" goes to the library. Regression spec e2e/auto-open-last-book.spec.ts. Note: navigateToLink (services/deep-links/use-deep-links.ts) uses the same un-awaited replace+push pair and likely leaves "/" under the invite screen on cold start; harmless today because "/" then redirects to the library.
<!-- SECTION:NOTES:END -->
