---
id: TASK-171.13
title: Social follow-ups from the buddy-read device test
status: Done
assignee:
  - '@claude'
created_date: '2026-09-27 11:02'
updated_date: '2026-10-02 16:58'
labels:
  - social
  - web
  - app
dependencies:
  - TASK-171.8
parent_task_id: TASK-171
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fixes for problems found while testing TASK-171.8 on a phone and in the web build.

- A sync push without a word count overwrites the stored `sync_books.word_count` with null, which turns a buddy-read member's percent into unknown.
- The web build shows the signed-out Social screen until the session is restored.
- The Android WebView never reports offline, so offline notices and disabled actions never engage on native.
- better-auth's `/api/auth/delete-user` purges in its own transaction before deleting the user row; the app has its own atomic deletion path.
- The sign-in page opened from the app flashes unstyled HTML before styles apply.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A push that carries no word count keeps the stored word count; an integration test covers it
- [x] #2 Social screens show a loading state, not the sign-in explanation, while a session is being restored
- [x] #3 On native the app knows when the device is offline and social screens show the offline notice with actions disabled; the web build keeps using the browser's online state
- [x] #4 better-auth's delete-user route is disabled, and account deletion goes only through the app's atomic path
- [x] #5 The sign-in page opened from the app renders styled from the first paint
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Word count: `bookUpsertSetPreservingMetadata` now keeps the stored `word_count` when a push carries null (`COALESCE(excluded.word_count, sync_books.word_count)`); the claiming set spreads it, so both paths are covered. A newer non-null count still wins (recount after a tokenizer change). Integration test added in `sync-book-upsert.integration.test.ts`.
- Session flash: `SyncContext` gains `isSessionResolved` (true once the stored session is checked, before the first full sync; initially true when sync is disabled). `SocialGate` shows its spinner until then. Verified in the web build: spinner, then the inbox, no sign-in screen in between.
- Offline on native: `useIsOnline` uses `@capacitor/network` (getStatus + networkStatusChange) on native and `navigator.onLine` on web. The Android WebView kept `navigator.onLine` true in airplane mode. Verified on the phone: offline notice, actions disabled. New dependency `@capacitor/network@^8.0.1`; `cap sync` registered it in the Android gradle files.
- Deletion: `disabledPaths: ["/delete-user", "/admin/remove-user"]` in the better-auth config (HTTP 404; server `auth.api` calls unaffected) and the `beforeDelete` hook removed. `deleteUserAccount` is the only deletion path; comments, the buddy-read test comment and `docs/social-buddy-reads.md` updated, the test modelling the better-auth path removed.
- Sign-in flash (Firefox, production too): Firefox bug 1459305 (open): a pending head stylesheet stops blocking rendering when anything flushes layout meanwhile, and the page is painted unstyled. Reproduced on the phone's Firefox with a delayed stylesheet; ruled out the scroll-restoration inline script and hydration timing (a client entry that waited for stylesheets did not help). Fix per the Mozilla thread: an empty classic inline script at the end of `<head>` (`{ children: "/**/" }` in the root head scripts), which blocks the parser until head stylesheets load, as Chrome does. Verified on the phone with a 2 s CSS delay: blank until the CSS arrives, then styled, no unstyled frame.
- Found on the way: `pnpm build` in apps/web failed on import protection (`@tanstack/react-start/server` reached the client bundle through `requireAdminSession` in `lib/admin.ts`, imported by the admin route). Fixed by wrapping it in `createServerOnlyFn`. It is only called inside server-function handlers.
- Found, not changed: production's CSP (`script-src` without `unsafe-eval`) blocks a JavaScript eval on the login page in Firefox; source not identified yet.
- Suites: web 152, core 127, app 662; typecheck clean on web and app.

Review pass (3 agents): web/server changes found sound (word-count COALESCE, disabledPaths incl. the inert delete-user/callback, createServerOnlyFn is a build-time marker, the head script renders last in head, is CSP-allowed and does not re-execute after hydration). Fixed: three more screens decided signed-out before the session check (invite deep link incl. its pending-link write, onboarding sync step, social settings) now wait for `isSessionResolved`; a misplaced doc comment in date-utils; the stale gate comment in SocialGate; the bug link on the head-script comment. Tests added: `formatAgo` boundaries (app) and the accepted invite card naming the viewer as host after a handover (web). Not changed: `useIsOnline` starts from `navigator.onLine` on native until `Network.getStatus()` answers, so a cold start in airplane mode shows online for that first moment; failed requests still surface as errors. Note for TASK-171.8: its pre-implementation notes still describe three deletion paths and a better-auth hook; there is now one path, `deleteUserAccount`, used by the account page and the admin action.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Follow-ups from the buddy-read device test.

- Sync: a push without a word count no longer erases the stored one (integration test).
- App: Social screens wait for the session check instead of flashing the sign-in screen; native offline detection uses `@capacitor/network`, so offline notices and disabled actions work on Android.
- Auth: better-auth's `/delete-user` and `/admin/remove-user` are disabled; `deleteUserAccount` is the only, atomic deletion path.
- Web: an empty inline script at the end of `<head>` stops Firefox from painting pages unstyled while the stylesheet loads (Firefox bug 1459305), which caused the flash on the sign-in page.
- Build: `requireAdminSession` is server-only, which unblocks `pnpm build` (import protection).

Verified on the phone (Firefox with a delayed stylesheet, airplane mode) and in the web build; web, core and app suites green.
<!-- SECTION:FINAL_SUMMARY:END -->
