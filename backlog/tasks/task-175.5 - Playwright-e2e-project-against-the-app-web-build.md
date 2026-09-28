---
id: TASK-175.5
title: Playwright e2e project against the /app web build
status: Done
assignee:
  - '@claude'
created_date: '2026-09-28 16:19'
updated_date: '2026-09-28 17:59'
labels:
  - tests
  - e2e
  - web
  - app
dependencies:
  - TASK-175.2
parent_task_id: TASK-175
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The existing Playwright suite (`apps/capacitor/e2e`, 72 specs) runs `pnpm dev` at `/`, with no server and no auth. Nothing tests the real web build: the capacitor bundle built with `WEB_BUILD` under basepath `/app`, served by `apps/web` with cookie auth and a real database. No social flow has an e2e test.

Add a second Playwright project, with its own config and `webServer`, that:
- builds the capacitor web bundle for `/app` (`WEB_BUILD=1`) into `apps/web/public/app`;
- runs `apps/web` against a throwaway, migrated test database with seeded users;
- signs in through the real website login, so the session is a cookie.

Specs: W1, W7, and a social smoke flow. Document how to run it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A separate Playwright config/project builds the /app web bundle, starts apps/web against a throwaway migrated database with seeded test users, and tears the database down afterwards; the existing root-mode suite is unchanged
- [x] #2 Tests sign in through the real website login (cookie session) and navigate within /app
- [x] #3 Spec: in scroll mode, Escape and an empty-margin click each dismiss the selection toolbar
- [x] #4 Spec: signing in from onboarding on the web build returns to /app
- [x] #5 Spec (social smoke): user A creates an invite link, user B (second browser context) opens it, signs in and adds A; both see each other in the Social tab friends list
- [x] #6 docs (docs/e2e.md or the capacitor agents doc) describe how to run the new project locally and what it needs (Postgres URL, env)
- [x] #7 The new project passes locally
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implementation (2026-09-28)
- **Config:** `apps/capacitor/playwright.app.config.ts` (testDir `e2e-app/`, port 3417, 1 worker because live-board state is in memory) plus `pnpm e2e:app`. `pnpm e2e` (`playwright.config.ts`, testDir `e2e/`) is untouched and does not pick up these specs: 75 of 75 as before.
- **Server, `e2e-app/support/serve.mjs`:**
  - It creates `lesefluss_e2e_app_<ts>` on the local Postgres (from `E2E_APP_PG_URL`, or the server in `apps/web/.env`; a guard refuses any other name), runs `drizzle-kit migrate` and seeds 6 verified users with better-auth's `hashPassword`, so no mail is ever sent.
  - It builds the WEB_BUILD embed into `apps/web/public/app` and runs `vite build` for apps/web the way the Dockerfile does, with UMAMI and Sentry blanked, then runs `.output/server/index.mjs` with test env (dummy OAuth and Resend keys).
  - It drops the database once the server exits. Playwright's globalTeardown runs while the server still holds connections, so the drop lives here instead; SIGTERM is followed by SIGKILL after 3 s because open live-board streams block a graceful stop.
  - Databases left by a killed run are dropped at the next start, and a failed migrate, seed or build drops its own database. Verified with 0 leftovers.
  - `E2E_APP_REUSE_BUILD=1` skips the build.
- **Setup project (`e2e-app/setup/accounts.setup.ts`):** every account signs in through the real /login page and its cookie `storageState` is saved to `e2e-app/.auth/` (gitignored). Then over the HTTP API: handle claims, a cy and dee friendship through an invite, a synced book and a buddy read that dee accepts.
- **Specs** (`e2e-app/`):
  - `selection-toolbar`: Escape and a margin click dismiss the toolbar; a resize to 420 px moves it with the selection (TASK-175.2 #3).
  - `sign-in-return`:
    - onboarding, then Sign in, then /login, back on /app/tabs/library, signed in, and no onboarding again (TASK-175.2 #4);
    - the signed-out social tab, then /login, then back on /app/tabs/social.
  - `invite-friend`: ada creates a link in the app. bea, signed out, opens /invite/<token>, follows "Continue in the web app", signs in and taps Add friend. Both see each other's @handle in Social.
  - `live-board`: cy and dee see each other's live dot; closing cy's tab (pagehide) drops it within 10 s, below `LIVE_IDLE_MS` (TASK-175.1 #7).
  - `website-social-toggles`: /account live and feed toggles, the confirmation dialog, cancel, and persistence across reloads (TASK-175.3 #5).
  - `base-path` (phone and desktop): /app/, library and settings with no same-origin 4xx, no failed requests and no console errors; every script is under /app/assets/.
  - `local-store-unload`: the TASK-175.6 regression guard.
- **Found a real bug:** TASK-175.6, jeep-sqlite losing the local store on unload. Fixed with a pnpm patch.
- **Docs:** `agents/capacitor.md`, new section "E2E tests", plus a note on the jeep patch in the web-embed section.
- **CI:** not wired. It would need a Postgres service container, `E2E_APP_PG_URL` and `playwright install chromium`.

## Verification
- **Mutation checks,** each on a rebuilt bundle and restored from a backup, each caught:
  - the toolbar ignoring resize;
  - Escape not dismissing;
  - the onboarding sign-in without its redirect;
  - the signed-out social tab dropping `returnTo`;
  - the invite CTA pointing at the website social page;
  - no pagehide stop;
  - the feed switched off without confirmation;
  - the live toggle not saved;
  - the bundle built for `/`.
  - `local-store-unload` failed 3 of 3 against unpatched jeep-sqlite.
- **Full `pnpm e2e:app`, with build, twice:** 11 of 11 both times, 41 s wall clock each. That is about 15 s of build and 17 s of tests (setup 2.9 s; specs 1 to 3 s each), plus server start and stop.
- **`sign-in-return`:** `--repeat-each 10`, 22 of 22.
- **Existing `pnpm e2e`:** 75 of 75 (8.1 min).
- **Checks:** capacitor `pnpm check-types` passes 681 of 681, and Biome is clean.
- **Not automated:** TASK-175.2 #6 (the long-press callout in a real mobile browser) and anything on a physical device.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Adds a second Playwright project that tests the web app as users get it at lesefluss.app/app:
- the WEB_BUILD bundle, served by the production apps/web server;
- a throwaway, migrated Postgres database with seeded accounts;
- sign-in through the real /login page.

`pnpm e2e:app` builds and runs everything in about 40 s, and `E2E_APP_REUSE_BUILD=1` skips the build.

**What the specs cover** (each checked against a mutation of the code it guards):
- dismissing and repositioning the selection toolbar;
- signing in from onboarding and from the social tab, and returning to /app;
- an invite link redeemed through the web app;
- the live board dropping a closed tab;
- the website's activity toggles;
- /app assets loading without errors on phone and desktop sizes;
- the local database surviving an unload mid-save.

The project found a real data-loss bug, TASK-175.6, which is now fixed. It also closes the browser-only acceptance criteria in TASK-175.1, 175.2 and 175.3.

Results: both full runs 11 of 11, and the existing dev suite unchanged at 75 of 75.
<!-- SECTION:FINAL_SUMMARY:END -->
