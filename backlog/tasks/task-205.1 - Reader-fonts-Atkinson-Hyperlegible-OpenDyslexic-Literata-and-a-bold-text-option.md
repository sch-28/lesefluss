---
id: TASK-205.1
title: >-
  Reader fonts: Atkinson Hyperlegible, OpenDyslexic, Literata and a bold text
  option
status: Done
assignee: []
created_date: '2026-10-26 03:15'
updated_date: '2026-10-26 03:15'
labels:
  - reader
  - accessibility
milestone: m-13
dependencies:
  - TASK-205.8
  - TASK-205.9
modified_files:
  - packages/core/src/settings.ts
  - packages/core/src/sync.ts
  - packages/core/src/__tests__/sync-schema.test.ts
  - apps/web/src/db/schema.ts
  - apps/web/drizzle/0041_reader_bold.sql
  - apps/web/drizzle/meta/_journal.json
  - apps/web/src/lib/sync-settings-upsert.integration.test.ts
  - apps/capacitor/package.json
  - pnpm-lock.yaml
  - apps/capacitor/src/assets/licenses/fonts/atkinson-hyperlegible-OFL.txt
  - apps/capacitor/src/assets/licenses/fonts/opendyslexic-OFL.txt
  - apps/capacitor/src/assets/licenses/fonts/literata-OFL.txt
  - apps/capacitor/src/routes/tabs/settings/licenses.tsx
  - apps/capacitor/src/routes/tabs/settings/index.tsx
  - apps/capacitor/src/routeTree.gen.ts
  - apps/capacitor/drizzle/0044_reader_bold.sql
  - apps/capacitor/drizzle/meta/_journal.json
  - apps/capacitor/src/main.tsx
  - apps/capacitor/src/theme/reader-fonts.ts
  - apps/capacitor/src/theme/monochrome.css
  - apps/capacitor/src/services/db/schema.ts
  - apps/capacitor/src/services/db/queries/settings.ts
  - apps/capacitor/src/services/db/__tests__/settings-updated-at.test.ts
  - apps/capacitor/src/hooks/use-appearance-settings.ts
  - apps/capacitor/src/hooks/__tests__/use-appearance-settings.test.ts
  - apps/capacitor/src/components/appearance-pickers.tsx
  - apps/capacitor/src/pages/reader/reader-font.ts
  - apps/capacitor/src/pages/reader/reader-font.test.ts
  - apps/capacitor/src/pages/reader/use-loaded-reader-font.ts
  - apps/capacitor/src/pages/reader/use-font-load-count.ts
  - apps/capacitor/src/pages/reader/use-value-when-idle.ts
  - apps/capacitor/src/pages/reader/__tests__/use-reader-font-hooks.test.tsx
  - apps/capacitor/src/pages/reader/index.tsx
  - apps/capacitor/src/pages/reader/scroll-view.tsx
  - apps/capacitor/src/pages/reader/page-view/index.tsx
  - apps/capacitor/src/pages/reader/page-view/chunk-content.tsx
  - apps/capacitor/src/pages/reader/appearance-popover.tsx
  - apps/capacitor/src/routes/tabs/settings/reader.tsx
  - apps/capacitor/src/pages/settings/reader-preview.tsx
  - apps/capacitor/e2e/helpers/plain-book.ts
  - apps/capacitor/e2e/reader-fonts.spec.ts
  - apps/capacitor/e2e/settings-licenses.spec.ts
  - apps/capacitor/e2e/scroll-mode-appearance-anchor.spec.ts
  - apps/capacitor/e2e/reader-text-spacing.spec.ts
  - apps/capacitor/e2e/page-mode-chunk-crossing.spec.ts
parent_task_id: TASK-205
priority: medium
ordinal: 173000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The reader offers only Sans (the inherited system font) and Serif (Georgia). It bundles no fonts, so how it looks depends on the device, and readers with dyslexia or low vision have no suitable choice. Kindle, Thorium and Readest all ship a dyslexia font.

Add these bundled, open-licensed fonts:
- Atkinson Hyperlegible, for low vision
- OpenDyslexic
- Literata, a proper reading serif

Also add a bold text toggle, as in Apple Books and Moon+. The fonts must work offline in the native app and on old WebViews (see TASK-191.6). Bundle size matters because of e-reader and low-end targets. The font enum is mapped in apps/capacitor/src/hooks/use-appearance-settings.ts (readerFontStack) and validated in packages/core/src/sync.ts.

Depends on:
- TASK-205.8 (scroll-mode re-anchor on layout change)
- TASK-205.9 (sync accepts new enum values)

Risks from the 2026-10-26 review:
- **Late font swap, high risk.** The font gate in page-view/chunk-content.tsx (~139) checks document.fonts.status BEFORE the first layout that uses the new family. A font nobody has requested yet still reports "loaded", so the first measure uses the fallback font. The later swap changes scrollWidth, but nothing re-measures: there is no loadingdone listener, and the chunk ResizeObserver never fires because the chunk has a fixed size. Result: a stale page count, skipped or blank pages, and the next page turn saves a drifted word. scroll-view.tsx (~163) has the same gap, only partly covered by the 600 ms stability poll. Toggling bold loads a new font file, so it hits this too.
- Font family and bold must go into the page-mode layoutKey (page-view/index.tsx ~320) AND the chunk measure-effect deps (chunk-content.tsx ~126-158), plus the scroll layout key from TASK-205.8. A setting in only one of the two page-mode places freezes the lander.
- The web build has no service worker, so offline web support isn't possible.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 User can pick Atkinson Hyperlegible, OpenDyslexic or Literata in the reader Appearance popover and Settings > Reader, and the reader text renders in that font
- [x] #2 Fonts render with no network connection in the native app, and in the web build once loaded
- [x] #3 Bold text toggle makes reader body text bold in scroll, page and RSVP modes, using a real bold face where one is shipped
- [x] #4 Reader awaits document.fonts.load() for the selected family/weight before first measure, and page mode re-measures on document.fonts loadingdone; first open on a fresh install lands on the saved word
- [x] #5 Font family and bold are part of the page-mode layoutKey, the chunk measure deps and the scroll layout key
- [x] #6 Changing font or bold (locally or via sync while the reader is open) does not save a new reading position in scroll and page mode; reopening restores the same first visible word
- [x] #7 Unknown font values map to Sans in readerFontStack and the Settings select
- [x] #8 Font licenses are included in the repo; added bundle weight is noted in the task
- [x] #9 Tests cover settings validation and sync of the new values
- [x] #10 pnpm build and Android build succeed; new Playwright e2e covers font and bold change mid-chapter (position unchanged, reopen restores) in scroll and page mode; existing position-*, page-mode-*, appearance-persist and reader-images-progress e2e specs pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-26 (lese-worker), for review. Part 1/2: changes.

The task still held: only sans and serif existed and nothing was bundled; the 205.8 anchor and 205.9 forward-compat parse were in place.

Fonts:
- @fontsource/atkinson-hyperlegible, opendyslexic and literata 5.3.0 (all OFL-1.1), added with the owner's OK on the npm download.
- src/theme/reader-fonts.ts (imported in main.tsx) loads regular + bold, latin + latin-ext (OpenDyslexic ships latin only), no italics. Each @font-face has a unicode-range, so a face downloads only when used.
- Shipped cost (dist, woff2 only): 368 KB in 10 files. Atkinson 53 KB, Literata 79 KB, OpenDyslexic 236 KB. APK assembleDebug OK.
- Licenses: apps/capacitor/licenses/fonts/*-OFL.txt. The app has no screen that lists licenses.
- OWNER NOTE: OpenDyslexic's OFL names it a Reserved Font Name, and fontsource's files are subsets (modified versions) under that name. Fontsource and Google Fonts ship it this way, but it's a licensing call for the owner.

Settings:
- readerFontFamily accepts sans | serif | atkinson | opendyslexic | literata;
- new synced readerBold (DEFAULT false; capacitor 0044_reader_bold.sql, web 0041_reader_bold.sql, NOT NULL DEFAULT false).
- FONT_FAMILIES carries each font's CSS stack and bundled face; readerFontStack / readerFontFace / readerFontFamilyFor read it. An unknown font shows as Sans everywhere.

Loading:
- reader-font.ts: loadReaderFont awaits document.fonts.load('<400|700> 1em "<face>"'), never rejects, gives up after 3 s.
- useLoadedReaderFont gives the reader the font only once it has loaded: until the first one has, the reader shows its skeleton; after that it keeps the previous font until the next has loaded. So no layout runs on the fallback.
- useFontLoadCount counts document.fonts loadingdone; the count is in the scroll layoutKey, the page layoutKey and the chunk measure deps, so a late face (a latin-ext subset) is a layout change.

Rendering:
- The family and bold sit in all three keys.
- Bold is --reader-font-weight: 700 on the reader container (scroll, page, preview); headings stay 700.
- RSVP isn't changed: its focal word is always bold monospace (Courier) for the focal alignment, so the font doesn't apply and bold is already on.
- E-ink has no font rules.

UI:
- Popover: the fonts in a 2-column grid (labels in their own faces), plus a 'Bold text' Off/On row.
- Settings: FontCards in 3 columns + a 'Bold text' toggle.
- OpenDyslexic letter spacing checked at 0 / 0.12 / 0.2 em: already wide, so the 0.2 max needs no widening.

Part 2/2: tests and results.

Tests:
- core: the three new fonts accepted; an older client's push leaves readerBold out (the unknown-font test now uses 'comic-neue').
- web integration: an older push keeps bold.
- capacitor unit: font stacks and families; loadReaderFont (the face at the shown weight, nothing for system fonts, the timeout, a failed load); adopting a row without readerBold keeps it.
- e2e:
  - scroll-mode-appearance-anchor: 'bundled font' and 'bold text' (phone + wide);
  - new reader-fonts.spec (page mode, plain book, the OpenDyslexic files held back 1.2–1.5 s via page.route): font and bold via sync keep the word, save nothing, the next turn saves the page shown, reopen; and a cold open in a slow bundled font lands on the saved word.
  - Gotchas: page.route turns the HTTP cache off, so the delay goes in after setup. The popover's font picker loads every face, so these tests switch to page mode via synced settings.
- e2e/helpers/plain-book.ts is shared now (reader-text-spacing, page-mode-chunk-crossing, reader-fonts).

Red checks:
- With all font-load handling removed (the new wait, the loadingdone count and chunk-content's existing fonts.ready gate), the bundled-font case fails 2/2 (693… instead of 896).
- With only the new wait kept it's green 6/6.
- Desktop Chromium also covers it through the old ready gate alone: the face reports 'loading' when the measure runs. The review's 'status says loaded' case didn't reproduce; the wait doesn't depend on that timing.
- Not red: bold out of the page or scroll layoutKey. Something else re-anchors in the cases tried; kept on principle.

Results:
- tsc (app, e2e, web, core), biome (pre-existing only);
- vitest: app 1421, core 207;
- web 319/319 on a throwaway DB (lesefluss_it_2054, dropped); web build OK;
- full e2e with E2E_WORKERS=2, in thirds: 266 tests, 264 passed. Both failures were import-setup timeouts and passed on rerun (12/12, 4/4).
- @lowfps 4/4;
- pnpm run sync + assembleDebug OK (no install).

Deploy note (205.9 AC5): the server must ship before clients send the new fonts or readerBold.

2026-10-26 lese-planner: review round 1 (3 reviewers) + Chrome pass (font grid + bold work, no save, top line held). HIGH: a late face load (the 700 face for headings, or any face on web) re-anchors scroll mid-fling and drops in-flight page turns. Planner decisions: load 400+700 up front, count only loads of the current face, defer font-load re-anchors while scrolling/animating/dragging; own woff2-only @font-face rules with real unicode-range (fontsource per-subset CSS ships ~800 KB incl. .woff and no unicode-range); OFL texts shipped in public/licenses/fonts/ plus an offline 'Open source licenses' page under Settings > About. Licensing: a reviewer confirmed the fontsource OpenDyslexic file is the complete upstream font in a WOFF2 wrapper (1927 glyphs, original name table incl. RFN), so per the OFL FAQ the Reserved Font Name may stay; we must not subset it ourselves.

2026-10-26 review batch (lese-worker). Part 1/2.

1. HIGH, late face load snapping the scroll back.
- Reproduced first: a scroll in OpenDyslexic with its 700 face held back, headings only below the first screen. The top word jumped back mid-scroll (534 → 524) in 2/3 runs.
- Fix (a): loadReaderFont loads 400 and 700 of the face (headings and bold use 700).
- Fix (b): useFontLoadCount(face) counts only loadingdone events whose fontfaces include the reader's face, so the picker's labels and the UI font don't count.
- Fix (c): the new useValueWhenIdle holds the count back while the view is busy and re-checks every 100 ms. Scroll view: isScrollingRef, set by the scroll handler and cleared at scroll end. Page view: a turn animating or a drag pointer down.
- The e2e 'scroll mode: a bold face landing while the reader scrolls never pulls the scroll back' was red 5/5 with (a) and (c) removed and green 5/5 with either. That was on the CSS @font-face build. Since item 2's FontFace registration it stays green even with both removed, so today it's a guard, not a proven red. Not chased further (time-boxed).

2. Own faces: theme/reader-fonts.ts registers FontFace objects (registerReaderFonts in main.tsx) from @fontsource/*/files/*.woff2?url. woff2 only, regular + bold, fontsource's latin / latin-ext unicode-ranges; OpenDyslexic is its one complete latin file, unmodified, so no range. dist now holds exactly 10 woff2 files, 368,244 bytes, and no .woff. The earlier 368 KB counted only the woff2: the old build also shipped ~430 KB of .woff fallbacks. Faces stay 'unloaded' at app start (checked).

3. Licenses: the OFL texts moved to src/assets/licenses/fonts and are imported ?raw by a new route /tabs/settings/licenses ('Open source licenses' under Settings > About, collapsible per font). They're bundled, so they read offline; ?raw can't import from public/, and a public copy would only duplicate them. Reviewer note for the owner: OpenDyslexic's fontsource file is the complete font in a WOFF2 wrapper, unmodified, so the Reserved Font Name is fine.

Part 2/2.

4. Bold layout keys, now red-checked:
- page: the new test 'bold text pulled in by sync at the end of a chunk' (OpenDyslexic, placed on the chunk's last word via an adopted position). Bold adds a page over the chunk, so a page index the change didn't re-derive shows other text: red without isBold in the page key (1876… instead of 2001).
- scroll: bold applied via sync (not the popover); red without isBold in the scroll key (the line drifts 18 px).
5. Slow-face delays use a CDP Fetch session with a woff2 URL pattern (the cache stays on). The cold-open test asserts the face had loaded when the text appeared, not the timeout path. The fling test keeps page.route on purpose: with the cache on, the face lands after the scroll steps.
6. Settings font cards: 2 columns; the odd last card spans both (popover too).
7. Selected toggles in the popover: an inset 2px primary ring + semibold. !important, because monochrome.css sits in the legacy layer under the item's shadow-none utility.
8. Popover toggle items are min-height 44px (measured). aria-labelledby on all 11 toggle groups to their row or section labels. Font items carry aria-label with the full name (FONT_FAMILIES.name, e.g. 'Atkinson Hyperlegible'); Settings cards too.
9. The skeleton waits for dbSettings (useLoadedReaderFont takes null until then), so a cold settings query never lays out in Sans first; RSVP doesn't wait for the reader font.
10. Hooks split (reader-font.ts loader + hasLoadedFace; use-loaded-reader-font.ts, use-font-load-count.ts, use-value-when-idle.ts). Unit tests: the loader (both weights, system font, still pending at 2999 ms and done at 3000, failure), hasLoadedFace, useLoadedReaderFont (null first, keeps the old font until the new loads, stale A→B→C ignored), the filtered count. The race timer is cleared; one comment covers the chunk-content prop group; core: a non-boolean readerBold is dropped.
- New e2e/settings-licenses.spec.ts.

Results:
- tsc (app + e2e), biome (pre-existing only);
- vitest: app 1427, core 208;
- web 319/319 on a throwaway DB (dropped);
- full e2e with E2E_WORKERS=2, in thirds: 68 + 87 + 113 = 268/268;
- @lowfps 4/4;
- pnpm run sync + assembleDebug OK (no install);
- nothing left running.

The migrations 0044/0041 sit on 205.2's 0043/0040 in the journals; commit them together, in order.

2026-10-26 lese-planner: accepted. Review (3 reviewers, HIGH: late face load snapped scroll / dropped turns) + Chrome pass → batch (400+700 preload, face-filtered load count, idle hold, woff2-only FontFace registration 368,244 bytes, offline licenses page, bold keys red-checked, UI/a11y) → verifier DONE. Full e2e 268/268, @lowfps 4/4, vitest 1427 + core 208, web 319, APK OK. Follow-up before the checkpoint (handed to lese-worker with TASK-214): unit test for useValueWhenIdle and a deterministic fling e2e (CDP Fetch pause/release of the 700 face), since the timing-based fling test no longer goes red without the idle hold; optional dragRef cap for a mouse released outside the window.
<!-- SECTION:NOTES:END -->
