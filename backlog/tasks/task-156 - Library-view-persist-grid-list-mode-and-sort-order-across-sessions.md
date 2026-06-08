---
id: TASK-156
title: 'Library view: persist grid/list mode and sort order across sessions'
status: Done
assignee: []
created_date: '2026-06-07 22:39'
updated_date: '2026-06-08 01:18'
labels:
  - bug
  - library
  - ux
dependencies: []
references:
  - apps/capacitor/src/pages/library/index.tsx
ordinal: 60000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User feedback: the library does not remember their chosen layout (grid vs list) or sort order. Both reset to defaults every time the app is reopened, which is annoying for users who consistently prefer one view.

Currently the library's view mode, sort order, and filter are plain component state in `apps/capacitor/src/pages/library/index.tsx` (`viewMode`, `sortBy`, `filterBy`) with no persistence. They should survive app restarts so the user's chosen library layout sticks.

This is local UI preference, must work fully without an account (no dependency on sync/login).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Selected library view mode (grid vs list) persists across app restarts
- [x] #2 Selected sort order persists across app restarts
- [x] #3 Preferences persist without an account / with sync disabled
- [x] #4 Returning to the library after closing the app restores the last-used view mode and sort order
- [x] #5 Tests cover that a chosen view mode and sort order are restored on reload
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Library grid/list view mode and sort order now persist across app restarts, fully local (localStorage, no account/sync).

Implementation: new reusable `usePersistentString` hook (apps/capacitor/src/hooks/use-persistent-string.ts) — lazy-inits state from localStorage with a type-guard validator, persists on change, falls back safely when missing/invalid/storage-unavailable. Wired into the library's `sortBy` (key `lesefluss:library-sort`) and `viewMode` (key `lesefluss:library-view-mode`). `filterBy` left ephemeral on purpose (reopening pre-filtered would be surprising, and the feedback was specifically about grid type + sort order).

Tests: use-persistent-string.test.ts (3 passing) covers restore-after-reload, fallback when empty, and ignore-invalid.

Verified on a real Android device: switched to list view, force-stopped the app, reopened, list view was retained.
<!-- SECTION:FINAL_SUMMARY:END -->
