---
id: TASK-200
title: Volume keys turn pages in page mode and change WPM in RSVP
status: Done
assignee: []
created_date: '2026-10-20 21:14'
updated_date: '2026-10-20 21:28'
labels:
  - reader
  - android
dependencies: []
references:
  - /home/jan/.claude/plans/bright-popping-moonbeam.md
modified_files:
  - apps/capacitor/android/app/src/main/java/app/lesefluss/VolumeKeysPlugin.java
  - apps/capacitor/android/app/src/main/java/app/lesefluss/MainActivity.java
  - apps/capacitor/drizzle/0041_volume_keys.sql
  - apps/capacitor/drizzle/meta/_journal.json
  - apps/capacitor/src/services/db/schema.ts
  - apps/capacitor/src/services/db/queries/settings.ts
  - apps/capacitor/src/services/db/__tests__/settings-updated-at.test.ts
  - packages/core/src/settings.ts
  - packages/core/src/changelog.ts
  - apps/capacitor/src/hooks/use-appearance-settings.ts
  - apps/capacitor/src/services/volume-keys/index.ts
  - apps/capacitor/src/pages/reader/use-keyboard-shortcuts.ts
  - apps/capacitor/src/pages/reader/wpm.ts
  - apps/capacitor/src/pages/reader/rsvp-controls.tsx
  - apps/capacitor/src/pages/reader/index.tsx
  - apps/capacitor/src/pages/reader/appearance-popover.tsx
  - apps/capacitor/src/routes/tabs/settings/reader.tsx
  - apps/capacitor/src/pages/reader/__tests__/volume-keys.test.ts
priority: medium
ordinal: 161000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Android volume keys turn pages in reader page mode (down = next) and change WPM in RSVP. Device-local setting, default off, default on under E-ink mode; swap option. Native intercept in MainActivity.dispatchKeyEvent via VolumeKeys plugin, only active while the reader wants it. Also: PageDown/PageUp in page mode, clamp keyboard WPM changes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Setting off: volume keys change volume everywhere
- [x] #2 On, page mode, reader open: down = next page, up = prev, no volume HUD; swap inverts
- [x] #3 On, RSVP: up/down change WPM by 25, clamped 100-1000
- [x] #4 Scroll mode, outside reader, sheets/search/annotations open: volume behaves normally
- [x] #5 Fresh install with E-ink mode on: enabled by default; explicit off sticks
- [x] #6 Setting rows hidden on web/iOS; not synced
- [x] #7 PageDown/PageUp turn pages in page mode
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented per plan. tsc clean, vitest 137 files / 1241 tests green, biome clean on touched files. Volume-key Java compiles; full Android build currently blocked by a parallel TTS session's TtsPlayer.java:126 (uninitialized tts). Device verification (ACs) pending.

Review pass (3 reviewers + verifier) fixes: native passes keys through when no JS listener (reload safety) or audio mode != NORMAL (calls/VoIP); interception off while read-aloud active; appearance popover added to isBlocked; handler rechecks shouldInterceptVolume; addListener rejection handled at source; stepWpm dedupe; PaginationStyle typing; schema comment trimmed. tsc clean, 1245 tests green, Android compile OK. Device verification still pending.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Volume buttons turn pages in reader page mode (down = next, swappable) and change WPM by 25 in RSVP (clamped 100-1000). Native VolumeKeysPlugin intercepts in MainActivity.dispatchKeyEvent only while the reader enables it: page mode or RSVP, no blocking sheet/popover open, read-aloud off, not in a call, and a JS listener attached. Device-local settings volumeKeyPageTurn (nullable, unset follows E-ink mode) and volumeKeyInvert via migration 0041; toggles in Settings > Reader (Hardware buttons) and the reader Appearance popover, Android only, not synced. Also: PageDown/PageUp turn pages in page mode; keyboard WPM changes now clamped (shared wpm.ts). Reviewed by 3 fresh-context agents + verifier, findings fixed. tsc clean, 1245 tests green, verified by user on Pixel 8 Pro. Changelog entry added.
<!-- SECTION:FINAL_SUMMARY:END -->
