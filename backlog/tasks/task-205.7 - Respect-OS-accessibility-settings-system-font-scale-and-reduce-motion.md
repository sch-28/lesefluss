---
id: TASK-205.7
title: >-
  OS accessibility settings: verify system font scale handling, make it
  position-safe, and respect reduce motion
status: To Do
assignee: []
created_date: '2026-10-20 22:23'
updated_date: '2026-10-20 22:35'
labels:
  - accessibility
  - android
milestone: m-13
dependencies:
  - TASK-205.8
parent_task_id: TASK-205
priority: medium
ordinal: 179000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Users who raise Android's system font size or turn on "remove animations" expect apps to follow.

**Font scale.** The original premise was "the OS scale is ignored". The 2026-10-21 review found it is probably false. Nothing sets WebView textZoom (MainActivity.java, capacitor.config.json), and Android WebView's default textZoom follows the system font scale. So the OS scale is most likely already multiplied onto the app UI size (theme-context.tsx sets the root font-size in px) and onto the reader font px (scroll-view.tsx, page-view/chunk-content.tsx). This is not yet verified on a device with font_scale != 1.0.
- Seeding defaults from fontScale would apply the scale twice.
- Adding setTextZoom(100) would shrink text for existing users who have a large OS scale.

**Progress risk.**
- AndroidManifest configChanges has no fontScale, so an OS scale change recreates the activity. The position then survives only through the pause flush.
- If fontScale is added to configChanges instead, page mode's layoutKey (page-view/index.tsx) ignores textZoom, and the ResizeObserver only watches container size. A text-only reflow would not re-anchor, and the next settle would save an unrelated word.
- Scroll mode is protected by the TASK-174 hasMoved rule.

If seeding from the OS scale turns out to be needed, read fontScale by extending the existing DeviceInfoPlugin (the web build has no equivalent). Seeds must not stamp settings updatedAt, because readerFontSize is synced and TASK-190 is about fresh installs overwriting synced settings.

**Reduce motion.** Support is partial today: framer MotionConfig reducedMotion="user", a check in the scroll-follow jump, and one goal-animation media query. The app uses TanStack router with no Ionic and no route transitions, so the reader-unmount timing is unaffected. The page-turn settle runs on a timer, not transitionend. E-ink mode already proves that `transition:none !important` is safe.

Step one: verify on device, then decide. Scaling may already work, in which case the work is layout fixes and position safety.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Verified on an Android device with a large system font scale whether WebView textZoom already applies it; finding documented in the task
- [ ] #2 Chosen approach does not apply the OS scale twice and does not change text size for existing installs
- [ ] #3 If defaults are seeded from the OS scale: seeding does not bump settings updatedAt and never overrides server settings adopted on first pull (TASK-190)
- [ ] #4 Changing the OS font scale while a book is open (scroll and page mode) does not save a different word; reopening after a scale change between sessions restores the same word
- [ ] #5 Layouts (tab bar, sheets, settings rows, reader chrome) do not clip or overlap at the largest Android font scale
- [ ] #6 With OS reduce-motion / remove-animations or prefers-reduced-motion on: sheet/drawer, popover, page-turn and goal animations and read-aloud follow smooth scrolling are disabled or instant
- [ ] #7 Reduce-motion CSS reuses only the motion rules of eink.css (animation, transition, scroll-behavior), not its box-shadow/backdrop overrides
- [ ] #8 pnpm build and Android build succeed; Playwright e2e covers prefers-reduced-motion (no page-turn animation, position unchanged across turns); existing position-*, page-mode-* and eink-mode e2e specs pass
<!-- AC:END -->
