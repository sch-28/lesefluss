---
id: TASK-191.3
title: >-
  E-ink mode: device-local setting that removes motion, blur and low contrast
  app-wide
status: To Do
assignee: []
created_date: '2026-10-02 22:44'
labels:
  - android
  - ui
  - ereader
  - e-ink
dependencies:
  - TASK-189
documentation:
  - apps/capacitor/src/hooks/use-prefers-reduced-motion.ts
  - apps/capacitor/src/contexts/theme-context.tsx
  - packages/ui/src/styles/tokens.css
parent_task_id: TASK-191
priority: high
ordinal: 142000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add one switch, "E-ink display", on the General settings page (TASK-189 layout) that makes the whole app behave well on e-ink: no transitions or keyframe animations anywhere (sheet/dialog/popover enter-exit, tab and colour transitions, spinners, skeleton shimmer, explore marquee, stats number counters, framer-motion in social and stats), no backdrop blur, no soft shadows or gradients, a high-contrast paper palette (pure black on white, solid 1px borders, no muted greys for essential text), and reader defaults of page mode with instant page turns and tap-only turning (finger-follow drags smear on e-ink). The existing page-turn animation toggle (TASK-116) stays and is forced off while e-ink mode is on.

Why: TASK-116 covered one animation; everything else still ghosts. A single mode is what e-ink users expect (Boox apps advertise it) and is far cheaper to maintain than per-component opt-outs. The setting is device-local like `pageTurnAnimation` (not synced), because it describes the screen, not the user.

Nice-to-have inside scope: suggest enabling it on first launch when the device manufacturer is a known e-ink maker (ONYX etc.), once, dismissible. Mechanism should be a root attribute or class plus a global stylesheet override and a framer-motion `MotionConfig` so new components inherit it without remembering to opt in; the existing `usePrefersReducedMotion` hook should return true in e-ink mode so the three components that already honour it keep working.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 New device-local, non-synced setting with migration; default off; existing installs unchanged
- [ ] #2 Toggle on Settings > General with a subtitle explaining what it does; also reachable from the reader appearance popover
- [ ] #3 With it on: no CSS transition or animation runs anywhere in the app (verified by an e2e that asserts computed transition/animation durations are 0 on representative surfaces: sheet, dialog, tab bar, reader progress bar)
- [ ] #4 With it on: no backdrop-filter or box-shadow is applied on headers, sheets, dialogs, drawers, cards
- [ ] #5 With it on: a high-contrast theme is active regardless of the chosen light/dark/sepia theme, and the three theme cards explain that e-ink overrides them
- [ ] #6 With it on: new books open in page mode with instant turns; swipe-to-turn is replaced by tap zones and the page-turn animation toggle shows as off and disabled
- [ ] #7 With it off: visual output is byte-identical to today (existing e2e specs pass unchanged)
- [ ] #8 On a device whose manufacturer is a known e-ink vendor, a one-time prompt offers to enable the mode; dismissing it never shows it again
- [ ] #9 Settings e2e covers toggle persistence across restart
<!-- AC:END -->
