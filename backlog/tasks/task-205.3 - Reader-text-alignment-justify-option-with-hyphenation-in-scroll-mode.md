---
id: TASK-205.3
title: 'Reader text alignment: justify option with hyphenation in scroll mode'
status: Done
assignee: []
created_date: '2026-10-26 03:15'
updated_date: '2026-10-27 01:09'
labels:
  - reader
milestone: m-13
dependencies:
  - TASK-205.8
  - TASK-205.9
modified_files:
  - packages/core/src/settings.ts
  - packages/core/src/sync.ts
  - packages/core/src/__tests__/sync-schema.test.ts
  - apps/web/drizzle/0042_reader_text_align.sql
  - apps/web/drizzle/meta/_journal.json
  - apps/web/src/db/schema.ts
  - apps/web/src/lib/sync-settings-upsert.integration.test.ts
  - apps/capacitor/drizzle/0045_reader_text_align.sql
  - apps/capacitor/drizzle/meta/_journal.json
  - apps/capacitor/src/services/db/schema.ts
  - apps/capacitor/src/services/db/queries/settings.ts
  - apps/capacitor/src/services/db/__tests__/settings-updated-at.test.ts
  - apps/capacitor/src/hooks/use-appearance-settings.ts
  - apps/capacitor/src/hooks/use-element-width.ts
  - apps/capacitor/src/hooks/__tests__/use-appearance-settings.test.ts
  - apps/capacitor/src/pages/reader/appearance-popover.tsx
  - apps/capacitor/src/routes/tabs/settings/reader.tsx
  - apps/capacitor/src/pages/settings/reader-preview.tsx
  - apps/capacitor/src/pages/reader/index.tsx
  - apps/capacitor/src/pages/reader/hyphenation-lang.ts
  - apps/capacitor/src/pages/reader/hyphenation-lang.test.ts
  - apps/capacitor/src/pages/reader/scroll-view.tsx
  - apps/capacitor/src/pages/reader/page-view/index.tsx
  - apps/capacitor/src/pages/reader/page-view/chunk-content.tsx
  - apps/capacitor/src/pages/reader/page-view/measurements.ts
  - apps/capacitor/src/pages/reader/line-rects.ts
  - apps/capacitor/src/pages/reader/__tests__/line-rects.test.ts
  - apps/capacitor/src/pages/reader/use-highlight-selection.ts
  - apps/capacitor/src/pages/reader/spoken-word.ts
  - apps/capacitor/src/theme/monochrome.css
  - apps/capacitor/e2e/reader-text-align.spec.ts
  - apps/capacitor/e2e/scroll-mode-appearance-anchor.spec.ts
  - apps/capacitor/e2e/settings-reader-preview.spec.ts
  - apps/capacitor/e2e/reader-text-spacing.spec.ts
  - apps/capacitor/e2e/reader-fonts.spec.ts
  - apps/capacitor/e2e/helpers/remote-settings.ts
  - apps/capacitor/e2e/read-aloud-position.spec.ts
  - apps/capacitor/e2e/page-objects/reader.ts
parent_task_id: TASK-205
priority: low
ordinal: 175000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Kindle, Apple Books and Moon+ offer left-aligned or justified text. Lesefluss is always left-aligned.

Hyphenation (`hyphens: auto` plus the book `lang`) currently applies only in page mode (apps/capacitor/src/pages/reader/page-view/chunk-content.tsx). Scroll mode has none, so justified text would leave big gaps there. Add an alignment setting (left or justify), and bring hyphenation and `lang` to the scroll list so justify looks good in both modes.

Depends on:
- TASK-205.8 (scroll-mode re-anchor on layout change)
- TASK-205.9 (sync forward-compat)

Findings from the 2026-10-26 review:
- Hyphenation in scroll mode is cheap: VList lays out only the mounted paragraphs.
- Words hyphenated across lines return two client rects. Page-mode measurements already use the first rect (measurements.ts ~257,264). But the selection handles use getBoundingClientRect (use-highlight-selection.ts ~261,274,290), which spans both lines, so they get misplaced. This bug already exists in page mode. spoken-word.ts (~25) has the same issue.
- The scroll save uses the bbox top (scroll-view.tsx ~676), so a split word at the top is skipped. That's stable on restore.
- Justified gaps between spans aren't tap targets, so drag selection can briefly find no word (word-at-point.ts). Highlights still cover the gaps.
- Decision: unknown book language keeps the existing deliberate "en" fallback in hyphenation-lang.ts (~312-322), matching page mode today.
- The alignment value must go into the page-mode layoutKey, the chunk measure deps and the scroll layout key.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Alignment setting (left / justify) in the Appearance popover and Settings > Reader; default left
- [x] #2 Justify applies in scroll and page mode, falling back to left where a line holds less than ~16em; the effective alignment is in the page-mode layoutKey, chunk measure deps and scroll layout key
- [x] #3 Automatic hyphenation only under justify, in scroll and page mode; lang on the container; an unknown book language falls back to the device language (common language names mapped)
- [x] #4 Selection handles and the read-aloud view word (firstVisibleWord) use the first/last client rect of the start/end word, correct for hyphen-split words in both modes
- [x] #5 Toggling alignment (locally or via sync while the reader is open) does not save a new reading position in scroll and page mode; reopening restores the same first visible word
- [x] #6 Setting syncs between devices; older clients omitting it do not reset it
- [x] #7 Tests cover the setting and sync
- [x] #8 pnpm build and Android build succeed; new Playwright e2e covers alignment toggle mid-chapter (position unchanged, reopen restores) in scroll and page mode and selection across a hyphen-split word; existing position-*, page-mode-*, highlights-* and selection-dismiss e2e specs pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-26 lese-planner (from the TASK-205.2 review): scroll-mode hyphens:auto must use the same lang path as page mode (chunk-content.tsx sets hyphens + lang); at extreme spacing (max letter/word + large font + wide margins) long words in scroll mode currently break mid-word without a hyphen. Chromium justify stretches spaces on top of word-spacing, so max word spacing + justify on narrow columns makes rivers: consider capping the effective word spacing when justify is on, or rely on hyphenation.

2026-10-26 from the TASK-205.2 review (lese-planner via lese-worker): scroll-mode `hyphens: auto` must use the same lang path as page mode (chunk-content's `lang`). With justify, the effective word spacing adds on top of the reader's word spacing (TASK-205.2's --reader-word-spacing, up to 0.48em), so consider capping it or relying on hyphenation.

2026-10-26 lese-worker, implementation:
- Setting: readerTextAlign "left"|"justify" (core DEFAULT_SETTINGS.READER_TEXT_ALIGN "left", the zod enum, SYNCED_SETTING_KEYS). Migrations: capacitor 0045_reader_text_align (journal idx 45), web 0042_reader_text_align (idx 42). They go after 205.1's 0044/0041.
- Hook: textAlignFor (unknown or unset reads as left, matching readerFontFamilyFor), textAlignVars (left sets no var, so it renders exactly as before), setTextAlign.
- UI: the popover's "Alignment" row (Left/Justify toggle group, aria-labelledby); the Settings > Reader "Justify text" ToggleRow; the settings preview follows it (lang=en + hyphens there too).
- Rendering: .reader-paragraph gets text-align: var(--reader-text-align, start). The var is set on the scroll container and the page-view container. textAlign is in the scroll layoutKey, the page layoutKey and the ChunkContent measure deps (alongside the existing prop-group comment).
- Scroll hyphenation: ScrollView takes `lang` (hyphenationLang(book.language), so it has the same 'en' fallback as page mode) and sets it on .reader-scroll-content; the VList style gets hyphens:auto. lang is in the scroll layoutKey too.
- AC4: new src/pages/reader/line-rects.ts (firstLineRect/lastLineRect); measurements.ts now uses it instead of its private copy. use-highlight-selection: the start handle uses the first fragment, the end handle the last fragment, and the toolbar position uses first/last. spoken-word firstVisibleWord uses the first fragment, consistent with the page index and the scroll save. markSpokenWord already used a Range, so it was already correct.
- Word spacing under justify: no cap. I rely on hyphenation; the reader chose that spacing. word-at-point gaps: all three callers ignore a null hit and keep the last word, so a drag over a justified gap just pauses; no change.

2026-10-26 lese-worker, tests:
- core sync-schema: the fixture carries justify. New cases: an unknown "center" is dropped, and a push from an older client that omits the field leaves it out. The old "ignores a field it doesn't know" case now uses readerHyphenation, since readerTextAlign is known now.
- web sync-settings-upsert integration: an older client keeps the justify another device set (8/8 on a throwaway DB, created, migrated and dropped).
- capacitor settings-updated-at: adopting a server row without the field keeps justify. use-appearance-settings: textAlignFor/textAlignVars. line-rects.test.ts.
- e2e reader-text-align.spec.ts:
  - scroll hyphens:auto + lang=en;
  - page mode, justify via sync and via the popover: the word stays visible, nothing is saved, and reopening restores the word with justify kept;
  - scroll + page selection on a real hyphen-split word (Chromium hyphenates; the first fragment starts mid-line): the end handle sits on the last fragment, the start handle on the first, as separate tests.
- e2e scroll-mode-appearance-anchor: justify (popover and sync) on phone and wide screens. layoutOf now includes the paragraph's text-align, because justify leaves a paragraph's last line unchanged, so the wide top line didn't move.
- e2e settings-reader-preview: the Justify text switch reaches the preview.
- Red checks, each restored afterwards: start handle reverted to bbox, 2/2 red; end handle reverted, 2/2 red; scroll hyphens removed, 3 red; page align var removed, 2 red. The layoutKey/measure-dep inclusion of textAlign can't go red, because justify doesn't move line breaks; it's there for correctness.
- Mouse-drag selection in page mode (desktop/web only): the page follows the pointer by about 8px, the handles sync to that offset, the page snaps back, and the handles don't re-sync. This bug already existed with ordinary words. The hyphen tests use touch long-press, which is the phone path.

2026-10-26 lese-worker, checks:
- tsc (app, e2e, web) clean; biome shows only pre-existing warnings/infos.
- vitest core 210, app 1438. A session-tracker property test hit a 5 s timeout under load avg 16; it passes alone and is untouched.
- Builds: the capacitor vite build went to a scratch outDir (the planner held the phone, so I left dist alone), and `pnpm --dir apps/web build` is OK.
- Full e2e with E2E_WORKERS=2: 285/285 (68+49+87+81; read-aloud-position re-run 18/18 after the 218 test stabilisation); @lowfps 4/4.
- AC8 is still open only for the Android build: there was no sync or gradle while the planner was running the device pass.

2026-10-26 lese-planner: review round 1 (3 reviewers, no HIGH). Owner decisions: (1) automatic hyphenation only with justify, in scroll and page mode (left-aligned text no longer hyphenates in page mode either); unknown book language under justify falls back to the device/app language instead of 'en'. (2) Justify falls back to left automatically when a line fits fewer than ~30 characters (effectiveAlign in all layout keys). Test fixes: vacuous lang check, findSplitWord settle/viewport, 218 tests decoupled from the TASK-219 race. Batch sent to lese-worker after TASK-219.

2026-10-27 lese-worker, review batch:

Owner decisions implemented:
- Hyphenation only under justify. textAlignVars(justify) sets --reader-hyphens: auto, and .reader-paragraph uses hyphens: var(--reader-hyphens, manual). The inline hyphens:auto in chunk-content, scroll-view and the settings preview is gone. Headings stay manual (hyphens is set only on paragraphs). VISIBLE CHANGE: page mode with left alignment no longer hyphenates (until now it always did), by owner decision.
- lang stays on the container in both modes. hyphenationLang(language, deviceLanguage = navigator.language): book tag, then the device language, then 'en'. Common names are mapped (English, German/Deutsch, French/Français, Spanish/Español, Italian, Dutch/Nederlands, Portuguese, Russian, Polish/Polski, Swedish/Svenska).
- Narrow lines: effectiveTextAlign(align, lineWidth, fontSize, letterSpacing) justifies only at lineWidth / (fontSize × (1 + 2·letterSpacing)) ≥ 16em, otherwise left. Page mode uses pageWidth. Scroll mode measures its container with the new useElementWidth hook (ResizeObserver) minus 2×margin; the settings preview does the same. The effective value (not the raw setting) goes into both layoutKeys and the chunk measure deps.

Nits: applyRemoteSettings moved to e2e/helpers/remote-settings.ts (4 copies removed); the popover uses setTextAlign(textAlignFor(v)); the Settings subtitle is now "Straight edges on both sides. Hyphenates long words.". AC4 wording fixed: firstVisibleWord, not the spoken-word mark (markSpokenWord already used a Range).

2026-10-27 lese-worker, review batch tests:

reader-text-align.spec:
- The lang check now seeds a book with language "de" and reads the lang on .reader-scroll-content / the chunk.
- "justified text hyphenates in the book's language" (justify + hyphens auto + de).
- "left-aligned text breaks only between words" (start + manual + de).
- scroll + page: "justify falls back to left where a line is too short, and the switch saves nothing" (360px, max font + max margin).
- findSplitWord opens with justify, waits for open settle + position quiet, and requires head/tail on screen. The start-handle top check is marked as a sanity check.

read-aloud-position.spec:
- pause() returns the latest saveLog read-aloud word.
- waitForAutoCommitToast extracted.
- In the clock tests, the waitPositionQuiet + savedWord pair became expect.poll(savedWord).
- The 218 tests have no pre-pause waits and no task IDs.

scroll-mode-appearance-anchor: the layoutOf doc now says "or its alignment changes".

Unit: hyphenation-lang (device fallback, names), effectiveTextAlign, textAlignVars (hyphens).

Red checks (each restored + cmp):
- left defaulting to hyphens:auto → the left test is red;
- the width rule ignored → both narrow tests are red.

One flake: the page-mode end-handle test once found no handle (1 of ~24 runs; 10/10 and 12/12 on reruns).

Checkpoint on the final tree:
- tsc app/e2e/web clean; biome shows only the pre-existing 3 warnings / 8 infos.
- vitest: app 1442, core 210.
- web vitest 320/320 on a throwaway local DB (rsvp_t2053, migrated, then dropped).
- capacitor vite build to a scratch outDir OK, with no e2e hooks in the bundle.
- Full e2e with E2E_WORKERS=2: 292/292 (68+49+91+84). library-bulk-select flaked once, then passed 30/30 on rerun; untouched area.
- @lowfps 4/4. Port 3101 free, nothing of mine running.

Not run: gradle (per the rules, no sync/gradle).

2026-10-27 lese-planner: accepted. Review (3 reviewers, no HIGH) + owner decisions (hyphenation only with justify in both modes; device-language fallback; narrow-line fallback to left) → batch → verifier DONE. Chrome pass: Left = hyphens manual; Justify = justify + hyphens auto with real hyphenation, no save, saved word stayed at the top; narrow fallback not reproducible in the tiled Chrome window (covered by e2e). Full e2e 292/292, @lowfps 4/4, vitest 1442 + core 210, web 320, vite + Android builds OK. Known LOWs: useElementWidth starts at 0, so a justify scroll open does one extra settling re-aim (harmless); the desktop scrollbar width isn't subtracted from the line width (~15 px).
<!-- SECTION:NOTES:END -->
