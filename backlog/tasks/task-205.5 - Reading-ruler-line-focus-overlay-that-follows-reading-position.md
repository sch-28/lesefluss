---
id: TASK-205.5
title: 'Reading ruler: line focus overlay that follows reading position'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-20 22:23'
updated_date: '2026-10-28 21:46'
labels:
  - reader
  - accessibility
milestone: m-13
dependencies:
  - TASK-205.9
parent_task_id: TASK-205
priority: low
ordinal: 177000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Kindle, Readest and dyslexia apps offer a reading ruler. It highlights or frames the current line or lines and dims the rest of the page, which helps readers with dyslexia or ADHD keep their place. Lesefluss has only a 2px active-word underline.

Add an optional reading ruler that marks the line or lines containing the active word. It follows the spoken word during read-aloud. Outside read-aloud it sits on the current active word, which the user sets with the existing word tap. No new gesture is added: taps are already taken (first tap sets the position, a second tap opens the dictionary, highlight or glossary, and during read-aloud a tap calls moveTo; reader/index.tsx ~1061-1081). There is no scroll-follow apart from read-aloud follow.

The ruler is a visual aid only. It must never write the reading position, never scroll and never turn pages.

Progress risks from the 2026-10-21 review:
- Scroll settles go through handleSetProgressWord, which sets userMovedRef. Page turns settle the same way. The unmount and pagehide flushes persist lastWordRef. So any ruler-driven scroll or page turn would save a position.

Performance and interaction notes:
- The spoken-word tick is already imperative (spoken-word.ts uses the CSS Highlight API, and followWord calls getBoundingClientRect once per word). Calling getClientRects on the same span right after adds no new layout. Moving the overlay with transform is compositor-only.
- Putting the ruler in React state would re-render every visible memoised Paragraph on each word.
- Page mode puts content in a translateX wrapper. A hyphenated word returns rects in two columns, so use the rect on the current page (see measurements.ts). During a chunk crossing the target rect is stale.
- The overlay must be pointer-events:none, or it breaks word taps, long-press selection, links and figure long-press.
- Old WebViews without CSS.highlights need their own feature check. On e-ink, a moving overlay forces a partial refresh on every line.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Reading ruler toggle and line count (1-3) in the Appearance popover and Settings > Reader; default off
- [x] #2 Ruler highlights the line(s) containing the active word and dims the rest in scroll and page mode
- [x] #3 Ruler follows the spoken word during read-aloud
- [x] #4 Ruler placement uses existing word-tap semantics (tap = set position, second tap = dictionary/highlight); no new tap gesture is added and nothing ruler-specific saves a position
- [x] #5 Toggling, moving or resizing the ruler never calls savePosition, never sets userMovedRef/lastWordRef, and never scrolls or turns a page
- [x] #6 After using the ruler and closing the book, reopening restores the same first word as without the ruler (scroll and page mode, sync off)
- [x] #7 Ruler moves via direct DOM/transform, not React state per spoken word; overlay is pointer-events:none so taps, long-press selection, links, highlights and image long-press behave unchanged
- [x] #8 Page mode: ruler uses the rect on the current page for words split across columns and is hidden during page/chunk transitions
- [x] #9 Ruler static (no animated movement) under E-ink mode and reduce-motion; feature-detected on old WebViews
- [x] #10 Ruler stays aligned after font size, spacing or orientation changes
- [x] #11 Setting syncs between devices
- [ ] #12 pnpm build and Android build succeed; new Playwright e2e specs cover ruler toggle/read-aloud without position change and reopen-restores-same-word in scroll and page mode; existing position-*, page-mode-* and jump-settle-guard e2e specs pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
PLAN ONLY (2026-10-28). Coding waits for the planner's go. Builds on word-gestures.ts / spoken-word.ts (TASK-205.6).

1. Overlay DOM and placement (both modes)
- New reading-ruler-overlay.tsx, rendered once inside the reader view (data-testid reader-view, already overflow: clip). It is a position:absolute; inset:0 layer, pointer-events:none and aria-hidden, holding three children: a dimmer above, a band (subtle tint plus outline), and a dimmer below.
- Each child is a fixed-size element moved only by transform: translateY, with will-change: transform. The dimmers are each a full view height tall (top one translated to bandTop - viewHeight, bottom one to bandBottom), so moving the band is compositor-only and never relayouts. A giant box-shadow dimmer was rejected: its layer would be several viewports in size.
- Horizontally the band spans the text column (page mode: the .page-clip box; scroll mode: the .reader-scroll-content column), so the margins dim too.
- Coordinates are relative to the reader view: rect minus the view's own rect. Scroll mode follows scrolling through one capture-phase scroll listener on the reader view (scroll events don't bubble, but capture reaches the ancestor), rAF-throttled: one getClientRects read and three transform writes per frame while the list moves. Scrolling doesn't dirty layout, so the read is cheap. Mounting the overlay inside virtua's scroll content would scroll it for free, but VList takes only items as children; rejected.

2. Finding the word without React state per word
- New controller module pages/reader/reading-ruler.ts: { show(word), hide(), relayout() }, holding the current word and the overlay elements in module/ref state. It reads span[data-word=N] from the view root at place time, the same lookup spoken-word.ts uses.
- Read-aloud: handleSpokenWord already calls markSpokenWord(word) per word; it also calls ruler.show(word), right after followWord's own getBoundingClientRect, so no new layout.
- Outside read-aloud: one useLayoutEffect in reader/index.tsx on activeWord (state that already exists and already re-renders only the active paragraph) calls ruler.show(activeWord). Placement is in the controller, never in React state; no prop reaches Paragraph.
- Writes happen only when the band's top or height changes (line granularity), so a spoken word on the same line costs one rect read and nothing else.

3. Band geometry (pure, unit-tested function)
- rulerBand(rects, viewport box, lineHeight, lines) returns { top, height } or null.
- lineHeight comes from the word's paragraph (computed line-height in px).
- lines 1: the word's line. lines 2: that line and the next. lines 3: one above and one below.
- A line rect is centred in its line box: top - (lineHeight - rect.height) / 2.

4. Page mode: split words and transitions
- A hyphenated word has one rect per column. The band uses the rect whose centre x lies inside the .page-clip box (the visible page or spread), the same rule measurements.ts uses for the current page. If none does (the word is on another page), the ruler hides.
- Hiding during motion: ReaderViewHandle gains an optional subscribeMotion(cb: (moving: boolean) => void).
  - Page-view reports moving=true when animateTo starts, when a drag locks horizontal, and while a landing is pending (pendingTargetRef set: chunk crossing, relayout, jump).
  - It reports moving=false after the settle or landing, or after a snap-back.
  - The ruler hides (visibility: hidden, no fade) while moving and re-places on false. A chunk crossing's stale rects are never read, because the re-place happens only after the lander has committed.
- Scroll-view needs no motion signal: the scroll listener re-places.

5. E-ink and reduce motion
- Normal mode: a 120 ms transform transition on the band and dimmers, so line changes don't jump. motion.css strips it under e-ink and OS reduce motion, so the ruler is static and only ever jumps.
- E-ink: no dimmers, since a grey wash ghosts. The band is a 2px black outline, and its position is written only on line change, so a partial refresh happens per line, not per word.
- Feature detection: the ruler needs only getClientRects and transforms, which every supported WebView has. It doesn't depend on CSS.highlights, so the spoken mark's own check stays where it is.

6. Never moves the position (AC4/5/6)
- The controller only reads rects and writes transforms on its own nodes. It never calls a view method (jumpTo, followWord, scrollBy, goNext), never touches lastWordRef, userMovedRef or settledWordRef, and never calls savePosition.
- Toggling the setting re-renders the overlay only. Placement by tap is the existing handleWordTap: the tap saves as it always has; the ruler adds nothing.

7. Alignment after relayout (AC10)
- ruler.relayout() on a ResizeObserver of the reader view (rotation, resize), on the font/spacing/margin/align settings (the same layoutKey inputs), and on document.fonts loading done. Page mode also re-places on motion=false after the layoutKey re-anchor.

8. Setting and sync (follows TASK-205.9)
- Two synced keys:
  - readerRuler: boolean, default false;
  - readerRulerLines: 1-3, default 1, constraint step 1.
  Two keys, not one 0-3 value, so turning the ruler off keeps the chosen line count.
- Touch points:
  - packages/core/src/settings.ts: DEFAULT_SETTINGS, SETTING_CONSTRAINTS, SYNCED_SETTING_KEYS;
  - packages/core/src/sync.ts: SyncSettingsSchema;
  - apps/web/src/db/schema.ts plus a web migration: NOT NULL DEFAULT matching DEFAULT_SETTINGS, as 205.9 requires for partial pushes;
  - capacitor schema.ts plus drizzle migration and journal, and queries/settings.ts defaults;
  - the satisfies-SyncSettings test fixtures in core sync-schema.test.ts and web sync-settings-upsert.integration.test.ts.
- Forward compatibility comes from 205.9: an old server ignores unknown keys per field, and old clients strip unknown pulled keys (zod object). HARD RULE: deploy the server with the new columns before any client ships these keys, or devices drift.
- Migration numbers: web 0043 is taken by TASK-162's uncommitted tombstone migration, so this takes the next free number when coded (likely web 0044, capacitor 0046); to be re-checked against the tree then.

9. UI
- Appearance popover: a Reading ruler Off/On row, plus a Lines stepper (1-3) shown when on.
- Settings > Reader: a ToggleRow plus a StepperRow, using the large-font-safe rows from 205.7.
- useAppearanceSettings: readingRulerFor(settings) plus setters, same pattern as the others.

10. Files I'd touch
- packages/core/src/{settings.ts, sync.ts, __tests__/sync-schema.test.ts}
- apps/web/src/db/schema.ts, apps/web/drizzle/<next>_reading_ruler.sql + meta, apps/web/src/lib/sync-settings-upsert.integration.test.ts
- apps/capacitor/src/services/db/{schema.ts, queries/settings.ts}, apps/capacitor/drizzle/<next>_reading_ruler.sql + meta/_journal.json
- apps/capacitor/src/hooks/use-appearance-settings.ts (+ test)
- apps/capacitor/src/pages/reader/{reading-ruler.ts (new), reading-ruler-overlay.tsx (new), __tests__/reading-ruler.test.ts (new), index.tsx, view-types.ts, page-view/index.tsx, appearance-popover.tsx}
- apps/capacitor/src/routes/tabs/settings/reader.tsx
- apps/capacitor/src/theme/monochrome.css (ruler styles) and eink.css (outline variant)
- apps/capacitor/e2e/reading-ruler.spec.ts (new) and the reader page object (ruler band box helper)

11. E2E (reading-ruler.spec.ts)
- a) Toggling on and off in the popover and in Settings > Reader requests no save, leaves scrollTop and the page unchanged, and shows/hides the band; the line count changes its height.
- b) Scroll mode: a word tap puts the band on that word's line and saves exactly what a tap saves without the ruler (one save, the word).
- c) Read-aloud with the ruler (fake TTS): the band follows the spoken line across several lines, and the only position writes are read-aloud's own; with the ruler off the save log is identical for the same speech.
- d) Page mode: after a turn the band sits on the settled first word's line. It is hidden while the slide runs (checked inside the key's task with animation on) and back after the settle; no turn or save comes from it.
- e) Reopen restores the same first word with the ruler on as off, in scroll and page mode, sync off.
- f) After a font-size step and a viewport resize, the band is realigned to the word's line (band top within a px of the line box).
- g) A long press under the band still selects, and a tap under it still taps (pointer-events: none).
- h) E-ink and reduce motion: the band has transition 0s, and e-ink shows the outline variant with no dimmers.
- Unit (vitest): rulerBand geometry for 1/2/3 lines, the split-word rect choice (two rects, one on the page), no visible rect -> null; and controller writes only on a line change.
- Existing to run: position-*, page-mode-*, jump-settle-guard, read-aloud-position.

Open for the owner: whether the band also shows outside read-aloud by default when enabled (the plan: yes, on the active word, per the description), and the e-ink outline-only look.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions (2026-10-28, planner defaults; the owner may override later):
- The band also shows on the active word outside read-aloud when the ruler is on.
- E-ink uses the outline-only band (no dimmers).
- Migration numbers get re-checked when coding starts (worker-2's TASK-205.4 adds no migration).
Status: plan approved. Coding is held until the TASK-205.6 review fixes are done.

2026-10-28 lesefluss-worker-2, part 1 (data + drawing):
- Settings: readerRuler (bool, default false) + readerRulerLines (1-3, default 1) in DEFAULT_SETTINGS, SETTING_CONSTRAINTS.READER_RULER_LINES, SYNCED_SETTING_KEYS, SyncSettingsSchema; capacitor schema + queries/settings defaults; web schema. Migrations: capacitor 0046_reader_ruler, web 0044_reader_ruler (both NOT NULL DEFAULT). Fixtures updated.
- pages/reader/reading-ruler.ts: rulerBand() pure geometry (fragment whose centre lies in the clip, line box from paragraph line-height, 1/2/3 lines) + ReadingRuler controller (attach, show(word), setLines, setMoving, relayout). Writes only transforms/size on its own nodes and only when the band changes.
- pages/reader/reading-ruler-overlay.tsx: three nodes (dim above, band, dim below), aria-hidden, pointer-events none; attaches to its parent (the reader view).
- CSS in monochrome.css: band tint + outline, dimmers, HC yellow outline, e-ink outline only with no dimmers; transition removed by motion.css under e-ink/reduce motion.
- hooks/use-appearance-settings: readingRulerFor() + setReadingRuler / setReadingRulerLines.
- Tests: reading-ruler.test.ts (9), readingRulerFor (3); vitest capacitor 1534, web 330 (throwaway DB, migration applied), core 210; tsc clean.
Left (wiring): mount overlay + ruler instance in reader/index.tsx (show on activeWord via useLayoutEffect, show on spoken word in handleSpokenWord, setLines, scroll capture listener -> relayout, ResizeObserver + layout settings + fonts -> relayout); page-view subscribeMotion -> setMoving (view-types.ts); popover + Settings > Reader toggle and lines stepper; e2e reading-ruler.spec.ts.

2026-10-28 part 2 (wiring):
- reader/index.tsx: readingRulerFor(dbSettings); useReadingRuler (new use-reading-ruler.ts) owns the ReadingRuler and keeps it aligned: passive capture scroll listener + ResizeObserver + document.fonts loadingdone + a dbSettings layoutKey, all rAF-throttled relayouts that write only the overlay. ruler.show(word) in handleSpokenWord (after markSpokenWord), and a useLayoutEffect on activeWord while read-aloud isn't playing. Overlay rendered inside reader-view when on and not RSVP.
- page-view: optional onMotion prop. syncMotion() reports moving = animating || landing pending || horizontal drag, from a no-deps layout effect, animateTo start/end and the drag lock; an instant turn reports false. The hook re-shows a frame after false (the landing's page commits in a later layout effect), and a newer report cancels that frame.
- Appearance popover: aria-label 'Appearance' (a11y fix), plus a 'Reading ruler' Off/On row and a 'Ruler lines' stepper when on. Settings > Reader: ToggleRow + StepperRow.
- e2e/reading-ruler.spec.ts (written, not run): toggle mid-chapter saves nothing (scroll, page), band on tapped word + grows with lines, taps reach words under it, page mode hides mid-slide and returns, reopen restores first word (scroll, page), realign after font size + resize, read-aloud follow with no non-read-aloud saves, reduce-motion 0s transition + e-ink outline without dimmers.
- vitest capacitor 1534, tsc clean (app + e2e).

2026-10-28 round 1 fixes:
- e2e setRuler queries the popover row like the others (.ap-row filter + radio).
- page-view: lander calls syncMotion() at its end (a landing on the same page index commits nothing more); the instant animateTo path syncs and then reports false; new onColumns prop (columnStride/columnWidth from pageGeometry).
- reading-ruler.ts: wordElement() falls back to the heading a word belongs to (headings render no spans), with line height from .reader-heading. rulerBand takes the text column, clamps to the clip, and with columns marks only the page column holding the fragment (spread); dimmers follow the column in page mode and span the view in scroll mode. Edges rounded, not sizes. The first show is placed without a transition.
- use-reading-ruler: isPaged; leaving page mode resets moving + columns. handleSpokenWord shows the ruler before the RSVP return.
- Spec: baselines after waitPositionQuiet, lastSavedWord in page mode, lines stepped via stepUpAppearance with a 2px tolerance, long press opens the selection, page-turn hide via MutationObserver after blur + page change asserted, reopen baseline before the ruler (lines changed before leaving), first page heading + same-page landing via synced font size (mutation-checked: fails without the lander sync), spread one-page band.
- Results: reading-ruler 14/14, a11y-labels, page-mode-spread, high-contrast-theme: 26/26 on port 3533. vitest 1539, tsc clean.

2026-10-28 round 2: completeInFlightAnimation now ends with syncMotion() (its cancelled timer would have reported the stop, and a follow-up move to the same page commits nothing). New e2e: read-aloud in page mode, 400 words 30 ms apart, longest stretch with the ruler hidden < 800 ms (without the fix: 1418 ms, i.e. stuck until the throttled save). The first-page heading test now waits for the new font size, records the hide with a MutationObserver and asserts the band overlaps the heading after landing. reading-ruler + page-mode-turn + read-aloud-position: 36/36 on 3533; vitest 1539; tsc clean. Multi-line chapter heading band is a planner follow-up.

Planner verification: 3 reviewers (position safety, geometry, data/sync/UI/tests) + 1 verifier. Two fix rounds: syncMotion ordering + completeInFlightAnimation, heading fallback, per-column band in the spread, page→scroll reset, spec races. Position safety confirmed by both the reviewer and the verifier (overlay-only writes, no save path). E2E: reading-ruler, page-mode-turn, read-aloud-position, page-mode-spread 44/44 on the planner's run; full suite 344 pass, 7 load flakes that pass alone. Deploy: migration web 0044 / capacitor 0046 (new fields, no enum, any order). Follow-up: TASK-205.12 (multi-line heading band).
<!-- SECTION:NOTES:END -->
