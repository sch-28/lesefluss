---
id: TASK-116
title: Option to disable page animation fo e-ink devices
status: Done
assignee: []
created_date: '2026-04-30 23:18'
updated_date: '2026-10-02 17:24'
labels: []
dependencies: []
priority: high
ordinal: 24000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
E-ink screens render the 220ms page-slide transition as a smear of ghosted frames. Add a setting to turn page-mode page turns into instant jumps.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 New persisted setting `pageTurnAnimation` (default on) with a migration; existing installs keep the animation
- [x] #2 With the setting off, every page-mode turn (tap, swipe commit, swipe snap-back, keyboard, chapter crossing) jumps instantly with no CSS transition, and position settling still happens
- [x] #3 Toggle available in Settings > Appearance (Pagination section) and in the reader appearance popover while in page mode
- [x] #4 Setting is device-local (not synced), since e-ink is a property of the device
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Settings column `page_turn_animation` (drizzle/0036_launch_and_page_turn.sql, shared with TASK-50), `DEFAULT_SETTINGS.PAGE_TURN_ANIMATION` in core, defaults in `getSettings()`. Not in `SYNCED_SETTING_KEYS`, so no web/sync schema change. `PageView` gets an `animatePageTurns` prop; when false, `animateTo` sets the transform without a transition and runs `onDone` synchronously (it clears the in-flight refs so the layout effect is not blocked). Hook: `useAppearanceSettings().setPageTurnAnimation`. UI: switch in settings/appearance.tsx and a page-mode-only row in appearance-popover.tsx. Finger-follow during a drag is unchanged (direct manipulation). No unit test: the change is a branch in a DOM/timer callback; e2e page-mode specs cover the default path.

Review fix: the instant branch of `animateTo` now calls `completeInFlightAnimation()`, which was moved above `animateTo`, instead of clearing refs by hand. A pending onDone from an animation that was running when the setting flipped now still runs.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
New device-local setting `pageTurnAnimation` (default on; migration 0036 adds `page_turn_animation`). When off, page mode turns pages instantly: taps, finished swipes, snap-backs, keyboard turns and chunk crossings skip the 220 ms transition and settle synchronously, so position saving is unchanged; finger drags still track live. Toggles: Settings > Appearance > Pagination ("Animate page turns") and the reader appearance popover in page mode. Flipping the setting mid-turn completes the in-flight animation instead of dropping its callback. Not synced across devices.

Verified: independent review (one nit fixed), e2e page-mode-* specs pass.
<!-- SECTION:FINAL_SUMMARY:END -->
