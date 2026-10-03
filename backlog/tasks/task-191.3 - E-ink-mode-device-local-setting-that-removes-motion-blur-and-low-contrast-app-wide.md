---
id: TASK-191.3
title: >-
  E-ink mode: device-local setting that removes motion, blur and low contrast
  app-wide
status: Done
assignee: []
created_date: '2026-10-02 22:44'
updated_date: '2026-10-03 16:32'
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
modified_files:
  - packages/core/src/settings.ts
  - packages/ui/src/lib/use-prefers-reduced-motion.ts
  - apps/capacitor/drizzle/0037_eink_mode.sql
  - apps/capacitor/drizzle/meta/_journal.json
  - apps/capacitor/src/services/db/schema.ts
  - apps/capacitor/src/services/db/queries/settings.ts
  - apps/capacitor/src/services/db/index.ts
  - apps/capacitor/src/services/db/__tests__/settings-updated-at.test.ts
  - apps/capacitor/src/hooks/use-appearance-settings.ts
  - apps/capacitor/src/hooks/__tests__/reduced-motion-eink.test.tsx
  - apps/capacitor/src/contexts/theme-context.tsx
  - apps/capacitor/src/index.html
  - apps/capacitor/src/theme/eink.css
  - apps/capacitor/src/theme/variables.css
  - apps/capacitor/src/pages/reader/index.tsx
  - apps/capacitor/src/pages/reader/page-view/index.tsx
  - apps/capacitor/src/pages/reader/appearance-popover.tsx
  - apps/capacitor/src/pages/library/stats/animated-number.tsx
  - apps/capacitor/src/pages/library/stats/activity.tsx
  - apps/capacitor/src/pages/library/stats/wpm-trend.tsx
  - apps/capacitor/src/pages/library/stats/nivo-theme.ts
  - apps/capacitor/src/pages/library/book-stats-card.tsx
  - apps/capacitor/src/pages/explore/shelf-frame.tsx
  - apps/capacitor/src/pages/onboarding/index.tsx
  - apps/capacitor/src/pages/onboarding/steps/theme.tsx
  - apps/capacitor/src/routes/tabs/settings/index.tsx
  - apps/capacitor/src/routes/tabs/settings/general.tsx
  - apps/capacitor/src/routes/tabs/settings/reader.tsx
  - apps/capacitor/src/routes/__root.tsx
  - apps/capacitor/src/components/appearance-pickers.tsx
  - apps/capacitor/src/components/rsvp-pickers.tsx
  - apps/capacitor/src/components/app-shell/TabBar.tsx
  - apps/capacitor/src/components/social/cover-backdrop.tsx
  - apps/capacitor/src/components/prompt-toast.tsx
  - apps/capacitor/src/components/sync/password-sign-in-form.tsx
  - apps/capacitor/src/components/sync/__tests__/password-sign-in-form.test.tsx
  - apps/capacitor/src/services/update-check/update-toast.tsx
  - apps/capacitor/src/services/device-info/index.ts
  - apps/capacitor/src/services/device-info/__tests__/eink-maker.test.ts
  - apps/capacitor/src/services/eink-suggestion/decide.ts
  - apps/capacitor/src/services/eink-suggestion/use-eink-suggestion.ts
  - apps/capacitor/src/services/eink-suggestion/__tests__/decide.test.ts
  - apps/capacitor/android/app/src/main/java/app/lesefluss/DeviceInfoPlugin.java
  - apps/capacitor/android/app/src/main/java/app/lesefluss/MainActivity.java
  - apps/capacitor/e2e/eink-mode.spec.ts
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
- [x] #1 New device-local, non-synced setting with migration; default off; existing installs unchanged
- [x] #2 Toggle on Settings > General with a subtitle explaining what it does; also reachable from the reader appearance popover and the onboarding theme step
- [x] #3 With it on: no CSS transition or animation runs anywhere in the app (e2e asserts every element on General, Library, Explore, Settings, the reader and an open dialog has zero transition duration and no animation)
- [x] #4 With it on: no backdrop-filter or box-shadow is applied anywhere (same e2e sweep)
- [x] #5 With it on: a high-contrast black-on-white look is active regardless of the chosen light/dark/sepia theme, the stored theme is kept, and the theme cards explain that e-ink overrides them
- [x] #6 With it on: books open in page mode with instant turns; a swipe turns the page on release without the page following the finger, tap zones and keys keep working, and the pagination and page-turn animation controls show the forced values as disabled
- [x] #7 With it off: behaviour is unchanged (existing e2e specs pass unchanged)
- [x] #8 On a device whose manufacturer is a known e-ink vendor: a fresh install gets the mode switched on before onboarding, an existing install is asked once, and declining or switching it off is never overridden; devices no list knows have the manual toggles
- [x] #9 Settings e2e covers toggle persistence across restart
- [x] #10 In e-ink mode the sign-in form leads with phone/QR sign-in, since typing on e-ink is slow
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Target is any e-reader, including cheap ones; the Boox Nova Air 2 is only a test rig. One device-local setting `einkMode` puts class `eink` on html/body and forces the effective theme to light (stored theme and the synced `readerTheme`/`paginationStyle` are never written).
1. Setting plumbing like `pageTurnAnimation`: core default, schema column, hand-written migration 0037, seed, `useAppearanceSettings` (plus effective pagination = page and page-turn animation = off while on).
2. Root: theme-context applies the class, caches it for the index.html boot script, wraps the app in framer-motion `MotionConfig skipAnimations`.
3. `theme/eink.css`, unlayered: no transitions/animations/smooth scroll, no backdrop blur or box shadows, black-on-white tokens, reader variables, solid chrome, greyscale figures.
4. JS motion switches: reduced-motion hook also true for `eink`, animated number, nivo charts, shelf smooth scroll, reader BLE smooth jump, page view `followFinger` (swipe = instant turn without finger-follow).
5. UI: toggle on Settings > General, reader popover and onboarding theme step; theme and pagination controls disabled with a hint while on; phone sign-in leads the sign-in form in e-ink mode.
6. Detection: tiny native `DeviceInfo` plugin (manufacturer/brand/model), extendable manufacturer list, one-time toast after onboarding; manual toggles cover every unknown brand.
7. Tests: unit (manufacturer matcher, reduced-motion hook, settings updated-at, prompt logic), e2e at 480x640, 749x998 and landscape.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Goal reframed with the user: any e-reader, including cheap ones; the connected Boox Nova Air 2 is only a test rig. Decisions taken with the user: e-ink mode forces page mode; a swipe becomes an instant turn without finger-follow (not tap-only); detection is a native manufacturer check plus a one-time toast, backed by manual toggles everywhere.

One root flag. `einkMode` (device-local, migration `0037_eink_mode.sql`, not in `SYNCED_SETTING_KEYS`) makes `theme-context` put class `eink` on html and body and report `light` as the effective theme; the stored `readerTheme` and `paginationStyle` both sync and are never written. `index.html` applies the cached class before first paint. `theme/eink.css` is imported unlayered from `variables.css`: `animation/transition: none !important`, no smooth scroll, no backdrop-filter, no box-shadow on everything; black-on-white tokens (`--input` stays grey so the switch track still shows off vs on); reader variables; solid backgrounds where chrome was translucent; transparent overlay scrims with a 2px border on overlay content; explicit selected states (outline for `aria-pressed`, inverted toggle-group and tabs items, bold underlined active nav link, for which TabBar gained `data-active`); focus outline (rings are box-shadows); blurred cover backdrop hidden. `animation: none` rather than zero duration so Radix Presence unmounts immediately; vaul and sonner use timers and are unaffected.

JS motion: `MotionConfig skipAnimations` (framer-motion 12.38) in ThemeProvider covers all 17 framer files; `usePrefersReducedMotion` (packages/ui) is also true while html has `eink` (MutationObserver), which stops the buddy trailer tick and the explore hero auto-advance; `AnimatedNumber` uses the hook; nivo charts `animate={!isEinkMode}`; shelf arrows scroll with `behavior: auto`. Reader derives `paginationStyle = page` and `pageTurnAnimation = false` in e-ink mode (`reader/index.tsx`, `use-appearance-settings.ts`); `PageView` got `followFinger`: when false the drag keeps axis lock, long-press cancel and pointer capture but never moves the page, and release commits past a fixed 40 px.

UI: `ToggleRow #eink-mode` on Settings > General, an "E-ink display" row in the reader popover, a toggle on the onboarding theme step. `ThemeCards` and `ModeCards` gained `disabled`; theme, pagination and page-turn controls are disabled with a hint while the mode is on. The sign-in form shows phone/QR first in e-ink mode.

Detection: `DeviceInfoPlugin.java` (`Build.MANUFACTURER/BRAND/MODEL`, registered in MainActivity) + `services/device-info` (`isEinkManufacturer` over an extendable list, null on web and on older native shells) + `services/eink-suggestion` (`einkSuggestionFor`: auto-enable before onboarding, prompt once after, never again once applied or declined; flags in localStorage). The update toast card was extracted into `components/prompt-toast.tsx` and reused.

Sample device probe over adb (read-only): ONYX / ONYX / NovaAir2, Android 11, WebView 149, system animation scales 0, 749x998 CSS px, Snapdragon 662 with 2.7 GB, Lesefluss 1.4.7 release installed. It confirmed the manufacturer match and also corrected the umbrella task: NeoBrowser there is Chromium 111, not ~85.

Verification: capacitor vitest 1022 (new: manufacturer matcher, suggestion decision, reduced-motion hook with the eink class, updated-at with einkMode, sign-in order), core 161, web 86; tsc and biome clean on touched files; `gradlew :app:compileDebugJavaWithJavac` passes. e2e `eink-mode.spec.ts` 8 cases at 480x640, 749x998 and 998x749 (toggle + restart + off, stored theme kept, page mode + no finger-follow + swipe turns via CDP touch, phone-first sign-in with a static dialog, onboarding toggle, effect sweep on main screens) plus 26 existing reader/settings/onboarding/sign-in specs, 34/34 green. Screenshots reviewed for General, Sync, the phone dialog, the reader and its popover.

Not done / open: not yet run on the physical Boox (the installed app is a release build of 1.4.7; replacing it needs a release-signed build or an uninstall, the user's call). Hard-coded colours in monochrome.css stay (TASK-130); frozen spinners have no loading text; RSVP on e-ink is limited by panel refresh. Apps on WebViews older than 111 do not render at all: tracked as TASK-191.6.

Two deviations from the plan, both deliberate: no greyscale filter on reader figures (colour e-ink panels exist, and a mono panel greys them anyway), and no change to the BLE smooth jump (it only runs in scroll view, which e-ink mode never uses).

Review pass (3 fresh-context opus reviewers: conventions, logic, CSS cascade + accessibility + privacy; plus an adversarial opus verifier): 21 findings, 19 confirmed, 2 refuted (LCD tablets from Kobo/tolino/B&N/PocketBook run Android 6 or older and cannot install the app at minSdk 24; destructive buttons are a grey tint, distinct from solid black primary). No privacy or security issue. Fixed: (1) cold start: theme-context applied defaults before settings loaded, stripping the cached `eink` class and flashing dark; now waits for settings and trusts the boot cache meanwhile. (2) onboarding pagination step hidden in e-ink mode; Settings landing shows the effective layout. (3) `resetAppData` also clears localStorage, so the e-ink suggestion can fire again after a reset. (4) e2e now also checks `document.getAnimations()` and samples transform/opacity on the framer-motion stats placeholder, with a control run that proves the check can fail. (5) styles: placeholders grey instead of black; switch, floating reader controls, ring-based state markers (streak today, live buddy, highlight swatches) and dropdown sub-menus get black edges; focus outline offset fixed; the frozen indeterminate bar fills the track with a stripe instead of reading as 33 %; charts monochrome in e-ink mode. (6) popover theme/pagination labels say "set by E-ink display". (7) a toast tells the user when the mode was switched on automatically. (8) conventions: one `readerLayoutFor` derivation shared by the hook and the reader, `isEinkMode` from `useTheme`, one exported `EINK_CLASS`, unused exports removed, naming.

On-device test (Boox Nova Air 2, debug build installed as app.lesefluss after the user removed the old release; driven over adb + the WebView debug port): fresh install auto-enabled the mode before onboarding (detection via DeviceInfo plugin works: ONYX), onboarding theme step shows the toggle on and the theme cards disabled, sign-in step leads with phone sign-in, a starter book imported in about 3 s, the reader opened in page mode, a real right-edge tap turned the page, a real 600 ms swipe left the page still under the finger (76 samples) and turned it on release, a left-edge tap went back, Settings toggle off/on switched between the stored dark theme and e-ink instantly, and a sweep on the device found 0 elements with transitions, animations, blur or shadows and 0 running animations. One real bug found there and fixed: the index.html boot script added the cached classes to `document.body`, which does not exist yet while `<head>` runs, so it threw and the first paint skipped the e-ink class; the classes now go on `<html>` only (theme-context sets both after mount), covered by a new e2e that records every root class during a restart. Remaining for the user to judge by eye: ghosting and refresh behaviour on the panel, which screenshots cannot show.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Lesefluss now has an "E-ink display" mode for e-readers of any make. One device-local switch (Settings > General, the reader popover and the onboarding theme step) makes the whole app static and high-contrast: no transitions or animations anywhere, including framer-motion, charts and carousels; no blur or shadows; black on white with clear borders and explicit selected states. The reader is forced to page mode with instant turns, and a swipe turns the page on release without the page following the finger. The chosen theme and pagination are kept and never written, since both sync to other devices; they return when the mode is switched off. In this mode sign-in leads with the phone/QR path.

On devices from known e-ink makers (Onyx Boox, Bigme, Meebook, PocketBook and others, via a small native plugin) a fresh install starts with the mode on, with a toast saying so; an existing install is asked once; the user's later choice always stands. Unknown brands use the manual toggles.

Tests: unit tests, an e2e spec at a small 6-inch viewport and at the Nova Air 2's size in both orientations (including a restart check that records every root class and a stillness check on a framer-motion screen), and the existing reader, settings, onboarding and sign-in specs, all green. Reviewed by three fresh-context reviewers plus a verifier; 19 confirmed findings fixed. Tested on a Boox Nova Air 2 over adb: detection, auto-enable, onboarding, page turns by real tap and swipe, the settings toggle and a no-motion sweep all behave as intended; the device test also found and fixed a boot-script bug. Ghosting on the panel itself still needs a human eye.
<!-- SECTION:FINAL_SUMMARY:END -->
