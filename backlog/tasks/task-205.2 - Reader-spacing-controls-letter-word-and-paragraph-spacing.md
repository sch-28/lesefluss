---
id: TASK-205.2
title: 'Reader spacing controls: letter, word and paragraph spacing'
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
  - packages/core/src/__tests__/settings.test.ts
  - packages/core/src/__tests__/sync-schema.test.ts
  - apps/web/src/db/schema.ts
  - apps/web/drizzle/0040_reader_spacing.sql
  - apps/web/drizzle/meta/_journal.json
  - apps/web/src/lib/sync-settings-upsert.integration.test.ts
  - apps/capacitor/drizzle/0043_reader_spacing.sql
  - apps/capacitor/drizzle/meta/_journal.json
  - apps/capacitor/src/services/db/schema.ts
  - apps/capacitor/src/services/db/queries/settings.ts
  - apps/capacitor/src/services/db/__tests__/settings-updated-at.test.ts
  - apps/capacitor/src/hooks/use-appearance-settings.ts
  - apps/capacitor/src/hooks/__tests__/use-appearance-settings.test.ts
  - apps/capacitor/src/theme/monochrome.css
  - apps/capacitor/src/pages/reader/index.tsx
  - apps/capacitor/src/pages/reader/scroll-view.tsx
  - apps/capacitor/src/pages/reader/page-view/index.tsx
  - apps/capacitor/src/pages/reader/page-view/chunk-content.tsx
  - apps/capacitor/src/pages/reader/appearance-popover.tsx
  - apps/capacitor/src/routes/tabs/settings/reader.tsx
  - apps/capacitor/src/pages/settings/reader-preview.tsx
  - apps/capacitor/e2e/page-objects/reader.ts
  - apps/capacitor/e2e/scroll-mode-appearance-anchor.spec.ts
  - apps/capacitor/e2e/reader-text-spacing.spec.ts
  - apps/capacitor/e2e/settings-reader-preview.spec.ts
parent_task_id: TASK-205
priority: medium
ordinal: 174000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Kindle, Apple Books and Thorium let readers adjust character, word and paragraph spacing. These are the most commonly requested dyslexia and low-vision settings. Lesefluss has line height and horizontal margins only. Paragraph spacing is hard-coded at 1.1em in apps/capacitor/src/theme/monochrome.css (~219); check eink.css for overrides.

Add letter, word and paragraph spacing. Defaults must match today's rendering. Follow the line-height pattern: a settings column, a range in packages/core/src/settings.ts, sync, the Appearance popover, Settings > Reader and the reader preview.

Depends on:
- TASK-205.8 (scroll-mode re-anchor on layout change)
- TASK-205.9 (sync forward-compat)

Findings from the 2026-10-26 review:
- Word spans contain no spaces, because whitespace sits in separate text nodes or space spans (paragraph.tsx ~322-376). word-spacing on .word spans would do nothing, so apply spacing on the reader container, in em.
- The existing controls are +/- steppers (appearance-popover.tsx ~140-177), not sliders. Each change writes SQLite, bumps settings.updatedAt and re-lays out 3 chunks of 2000 words. That cost 200-600 ms on the Boox (TASK-191.4). Live per-pixel slider input would jank and spam sync.
- Each new value must go into the page-mode layoutKey (page-view/index.tsx ~320) AND the chunk measure deps (chunk-content.tsx ~126-158), plus the scroll layout key. Missing either page-mode place freezes the lander or silently shows different text, and the next page turn saves that text's word.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Letter, word and paragraph spacing controls exist in the reader Appearance popover and Settings > Reader with defaults that match the current rendering exactly
- [x] #2 Controls are +/- steppers like line height (or commit on release); no re-pagination per drag tick
- [x] #3 Spacing is applied on the reader container in em units, not on word spans; values are in the page-mode layoutKey, the chunk measure deps and the scroll layout key
- [x] #4 Changing spacing (locally or via sync while the reader is open) does not save a new reading position in scroll and page mode; reopening restores the same first visible word
- [x] #5 Word tap targets, highlights, active-word underline and selection still line up with the text at max spacing
- [x] #6 An older client pushing settings without the new fields does not reset them on other devices
- [x] #7 Tests cover ranges/validation and sync round-trip
- [x] #8 pnpm build and Android build succeed; new Playwright e2e covers spacing change mid-chapter (position unchanged, reopen restores) in scroll and page mode; existing position-*, page-mode-*, appearance-persist and selection-dismiss e2e specs pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-26 (lese-worker), for review.

The task still held against the tree: the line-height pattern, 205.8's anchor hold and 205.9's lenient push parse were all in place.

Settings:
- core: DEFAULT_SETTINGS READER_LETTER_SPACING 0, READER_WORD_SPACING 0, READER_PARAGRAPH_SPACING 1.1 (em; 1.1 = today's hard-coded paragraph margin; eink.css has no override). Constraints: letter 0–0.2 step 0.02, word 0–0.5 step 0.05, paragraph 0.5–3.0 step 0.1 (covers WCAG 1.4.12: 0.12 / 0.16 / 2).
- SYNCED_SETTING_KEYS and SyncSettingsSchema each gain the three fields as plain ranged numbers, like line spacing.
- capacitor: columns + hand-written drizzle/0043_reader_spacing.sql (NOT NULL defaults) + journal entry; getSettings defaults.
- web: columns + drizzle/0040_reader_spacing.sql (NOT NULL DEFAULT, as 205.9 requires) + journal entry. The GET response picks SYNCED_SETTING_KEYS, so nothing else changed.

Rendering:
- textSpacingVars() sets --reader-letter-spacing / --reader-word-spacing (only when > 0) and --reader-paragraph-spacing on the reader container (scroll content, page view, Settings preview).
- .reader-paragraph reads them as letter-spacing / word-spacing / margin-bottom with fallbacks normal / normal / 1.1em, so the defaults render exactly as before.
- They resolve in em at each paragraph; no word span is touched.
- textSpacingKey() is in the scroll layoutKey, the page layoutKey and the chunk measure deps (chunk-content).

UI:
- The popover's numeric rows are a local StepRow (Size, Line spacing, Letter spacing, Word spacing, Paragraph spacing, Margins); 'Spacing' is renamed 'Line spacing'.
- Settings > Reader gets three StepperRows. Letter and word show a share of the font size (percentOfFont), paragraph a number.
- The preview gains a second paragraph so paragraph spacing shows.
- Hook: stepSetting(value, delta, range, round) for the new adjusters; round2 for letter and word.

Tests:
- core: settings defaults inside their range and on a step; push schema: spacing fields absent from an older client's push stay absent, an out-of-range value drops just that field.
- capacitor unit: textSpacingVars (default sets only the 1.1em paragraph gap), textSpacingKey, stepSetting (no drift, clamped), percentOfFont; saveSettings: adopting a server row that lacks the columns keeps local spacing.
- web integration: an older client's push keeps the spacing another device set; a first push without spacing stores today's rendering.
- e2e:
  - scroll-mode-appearance-anchor: letter, word and paragraph spacing via the popover on phone and wide (line on top, no save, reopen) + spacing pulled in by sync. layoutOf now includes the paragraph's margin-bottom, so a paragraph-gap change counts as a change.
  - new reader-text-spacing.spec: at max spacing a drag highlights exactly its words and a word tap marks and saves that word. In page mode, on a figure-free book: letter, word and paragraph spacing at max via sync (word stays visible, no save, a turn saves the page shown, reopen); popover letter steps (no save).
  - settings-reader-preview: .first() for the second paragraph + a spacing case.

Red checks:
- spacing out of the scroll layoutKey: 7 fail;
- out of the page layoutKey: the page-mode letter case fails. The big book could not show this: its figure breaks leave slack columns that absorb the reflow, hence the plain fixture.
- Not red: the chunk measure deps. The lander re-requests the measure itself when el.scrollWidth differs ('keeps a missed one from leaving the target pending'), so the deps are belt-and-braces.

Results:
- tsc (app, e2e, web, core), biome (pre-existing only);
- vitest: app 1405, core 200;
- web 318/318 on a throwaway local DB (lesefluss_it_2052; migrations incl. 0040 applied; dropped, verified);
- full e2e with E2E_WORKERS=2, in thirds: 68 + 85 + 100 = 253 tests, 251 passed. settings-reader-preview was mine (fixed, 2/2). selection-dismiss passed alone (3/3).
- @lowfps 4/4;
- pnpm run sync (vite build + cap sync) and ./gradlew assembleDebug succeeded (no install, daemon stopped).
- The root `pnpm build` was not run: it may rewrite the checked-in apps/web/public/app bundle.

Deploy note (205.9 AC5): the server migration and core schema must ship before any client sends the new fields.

2026-10-26 review batch (lese-worker).

1. The popover scrolls: collisionPadding 8 + max-h-(--radix-popover-content-available-height) overflow-y-auto overscroll-contain. e2e at 360x640: the last control scrolls fully into view.
2. a11y: StepRow (popover) and StepperRow (Settings) use aria-label 'Decrease/Increase {label}' (Size too) and aria-live=polite on the value. At min/max they use aria-disabled with an early return instead of `disabled`, so focus stays. Hit areas reach 44px through a ::before (popover 34px + 5px inset, gap 10px; Settings 36px + 4px inset, gap-2), so neighbours don't overlap. stepUpAppearance and the A+/A− locators now use the aria-labels. StepperRow also snapped to multiples of `step` from 0, not from `min`; with the paragraph grid (min 0.5, step 0.3) 1.1 + 0.3 became 1.5. It now snaps from min. Unit test, red with the old snap.
3. [D] Grids: letter 0–0.20 step 0.04, word 0–0.48 step 0.04, paragraph 0.5–2.9 step 0.3. Core test: 0.12, 0.16 and 2.0 are exactly on a step. Fixtures use word 0.16.
4. [D] 'Reset spacing' (resetTextSpacing: one save with all three defaults) in the popover and Settings > Reader. The value column shows 'Default' at the default (spacingLabel). e2e: reset brings all three to Default, letter-spacing normal.
5. A page-mode case on the plain fixture: at chunk 1's first page, max letter spacing via sync, turn back → the previous chunk's last word is on screen. Red with spacingKey out of the chunk-content deps (it lands on 1388… instead). The earlier note's 'cannot be red' claim was wrong: the lander's self-heal only covers the current chunk, while crossToNeighbor uses the neighbour's measured width.
6. Preview: three short paragraphs so the gaps show at defaults. Not sticky: the only sticky element on the page is the header, and a sticky 208px card would take a third of a 640px screen.
7. .reader-heading (chapter headings included) reads the letter and word spacing vars.
8. The goal divider's height is var(--reader-paragraph-spacing, 1.1em) at the paragraph font size; font, size and tabular numbers moved to the label; the comment is fixed. Checked in screenshots at 0.5 / 1.1 / 2.9: centred in the gap. At 0.5 the 11px label overflows the 8px box slightly but stays clear of the text.
9. textSpacingFor() rounds and clamps for the hook and the reader alike (no raw floats in the layout keys or CSS). Unit-tested with a drifted float and out-of-range values.
10. .reader-discussion-marker and the goal label: letter-spacing and word-spacing normal.
11. The popover page test polls for a layout change first; textSpacingKey it.each over all three; adjustLineSpacing goes through stepSetting; the reader's locals are readerLetterSpacing etc. (feeding textSpacingFor); the chunk-content textSpacing prop has its own doc.
12. `pnpm --dir apps/web build` succeeds (.output only).
- The scroll anchor probe (layoutOf) now also reads the next word's left: word spacing at 0.16em left the phone paragraph's breaks in place, so the change wasn't seen. The scroll layoutKey red check is still 7 fail.
- The 205.3 note is appended.

Finding outside this task (pre-existing, reproduced without any spacing change): in page mode, a back turn (ArrowLeft) across a chunk boundary shows the previous chunk's last page but saves nothing; the reader keeps the old position (e.g. 2002 while showing 1855–2001). Back turns within a chunk save. Not fixed here.

Results:
- tsc (app, e2e, web), biome (pre-existing only);
- vitest: app 1412, core 203;
- web 318/318 on a throwaway DB (lesefluss_it_2053, dropped, verified);
- full e2e with E2E_WORKERS=2, in thirds: 68 + 85 + 104 = 257 tests, 255 passed. scroll word spacing on a phone was the probe above (fixed, spec 25/25); reader-images-progress (an open-book setup timeout) passed on rerun 3/3.
- @lowfps 4/4;
- nothing left running.

2026-10-26 lese-planner: accepted. Review (3 reviewers, no logic HIGH; popover-scroll HIGH from two) + Chrome pass (controls work, 10 taps saved nothing, top line held) → batch (popover scroll + 360x640 e2e, stepper a11y, WCAG grids, Reset spacing, chunk-boundary back-turn test with red check, headings, goal divider, single rounding path) → verifier DONE. Full e2e 255/257 (both explained/green on rerun), @lowfps 4/4, vitest 1412 + core 203, web 318, Android + web builds OK. Small non-blocking follow-ups (off-grid snap, glossary avatar letter-spacing, Reset button spacing from '+', hover on aria-disabled) handed to lese-worker with TASK-213. Deploy note: server before clients (205.9 AC5).

2026-10-26 post-verification follow-ups (lese-worker, folded into the TASK-213 run):
1. textSpacingFor snaps to the stepper grid (the new snapSetting: min + round((v - min) / step) × step, rounded, clamped), so an off-grid stored value steps the same in the popover and in Settings. Unit: 0.06 → 0.08, paragraph 1.2 → 1.1.
2. .glossary-inline-avatar: letter-spacing normal.
3. .ap-reset-btn: left-aligned with an 8px top margin, clear of the last '+' hit area; in Settings, left-aligned with mt-2.
4. StepperRow: aria-disabled:hover:bg-transparent.
The full e2e run and @lowfps are green (see TASK-213).
<!-- SECTION:NOTES:END -->
