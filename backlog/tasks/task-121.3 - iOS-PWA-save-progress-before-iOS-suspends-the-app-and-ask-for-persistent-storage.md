---
id: TASK-121.3
title: >-
  iOS PWA: verify progress survives suspension, sync on resume in the web build,
  persistent storage
status: To Do
assignee: []
created_date: '2026-10-20 21:58'
updated_date: '2026-10-20 22:05'
labels:
  - pwa
  - ios
  - web
  - data-loss
milestone: m-14
dependencies:
  - TASK-203
  - TASK-121.6
references:
  - apps/capacitor/src/pages/reader/session-tracker.ts
  - apps/capacitor/src/pages/reader/use-reading-session.ts
  - apps/capacitor/src/hooks/use-is-foreground.ts
  - apps/capacitor/src/services/telemetry/index.ts
  - TASK-157
parent_task_id: TASK-121
priority: high
ordinal: 168000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
iOS suspends a home-screen web app as soon as it leaves the foreground and may kill it later without further events. Most of the saving already exists and only needs proving on iOS; the real gaps are sync on resume and storage persistence.

## Already in place (verify, don't rebuild)
- `@capacitor/app`'s web implementation fires `appStateChange`, `pause` and `resume` on `visibilitychange`.
- The reader flushes its position through `savePositionRef` on `pagehide`, `visibilitychange` hidden and `pause`, with the `userMovedRef` and seed guards (`pages/reader/index.tsx`, "Flush position on background / teardown").
- `writePosition` mirrors the position to localStorage synchronously before the async DB write; this mirror is the real guarantee when iOS freezes the page before an async write finishes.
- Scroll saves on settle (50 ms ticks, 600 ms cap, `scroll-view.tsx`); jumps and page turns save immediately; RSVP throttles to 2 s and flushes on `pagehide`, pausing when hidden (`use-rsvp-engine.ts`).
- The session tracker checkpoints on hidden (`use-reading-session.ts`, `session-tracker.ts`); the live board stops on `pagehide` with keepalive (`live-board.tsx`).

Whether the async DB write itself completes in WebKit's short grace period is not guaranteed; with jeep-sqlite every save re-exports the whole database, which is why this depends on TASK-203.

## Gaps to close
- **Sync on resume and on network-online is native-only.** `contexts/sync-context.tsx` registers `useAppResumeListener` / `useNetworkOnlineListener` (and other listeners) only when `NATIVE_SYNC_ENABLED` (`services/sync/session.ts`), which is false in the web build. Work out how the web build syncs today and make returning to the foreground trigger a pull/push there too.
- **Persistent storage.** `navigator.storage.persist()` exists from Safari 17 (the app's minimum is 16.4), so feature-detect it. WebKit grants it by heuristics without a prompt; being a Home Screen web app is the named heuristic, so expect a grant when installed. https://webkit.org/blog/14403/updates-to-storage-policy/
- **Telemetry.** Report the persist() result and `navigator.storage.estimate()` usage/quota. Web telemetry is currently disabled; TASK-121.6 enables it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 On a real iPhone with the installed app, signed out: read, background, kill the app; on relaunch the last position and the reading session are kept (all three reader modes)
- [ ] #2 An e2e:app test proves that a page hidden via visibilitychange persists the position and checkpoints the session
- [ ] #3 Returning the web build to the foreground (and coming back online) triggers sync for signed-in users, without a reload; Android is unchanged
- [ ] #4 persist() is feature-detected and requested once; the result and storage estimate are reported to telemetry
<!-- AC:END -->
