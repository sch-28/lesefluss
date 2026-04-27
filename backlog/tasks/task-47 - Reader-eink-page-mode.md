---
id: TASK-47
title: Reader 'eink page' mode
status: Done
assignee: []
created_date: '2026-04-27 15:59'
updated_date: '2026-04-27 20:34'
labels: []
milestone: m-5
dependencies: []
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Paginated, e-ink-style page turn instead of scroll.
<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped a polished paginated reader as a third in-app view mode, refactored the reader into per-mode "view" components, and laid the foundation for future page-mode polish.

## Outcome

Users can now choose between scroll, page, and RSVP. The page mode delivers e-ink-style page turns with seamless cross-chunk navigation, instant tap-to-flip for e-ink reliability, and long-press selection (with a new in-toolbar dictionary lookup) — same UX language as Apple Books / Kindle / Kobo.

## What changed

### Setting + UI
- New synced setting `paginationStyle: "scroll" | "page"` (default `scroll`) wired end-to-end per AGENTS.md: rsvp-core defaults + sync schema + `SYNCED_SETTING_KEYS`, capacitor schema + migration `0014_pagination_style.sql`, capacitor queries default, web schema + migration `0002_pagination_style.sql` (regenerated via drizzle-kit so the snapshot is consistent). Type alias `PaginationStyle` exported from rsvp-core.
- Toolbar unchanged: the existing flash button still toggles between RSVP and the standard reader. The standard reader's variant (scroll vs page) comes from the global setting, decided at render time — no swap effects, no in-session mode-state duplication.
- Appearance settings: new "Pagination" chip section directly under Theme, using the existing chip pattern.
- Onboarding: new conditional `pagination-style` step. Shown only when the user picked the standard reader (not RSVP) on the previous step.
- DRY: extracted a generic `<ModeCards options value onChange>` in `rsvp-pickers.tsx` to replace `ReaderModeCards` + `PaginationStyleCards` (single source for the card UI). Used by RSVP mode picker, pagination picker, and the settings form.

### Reader refactor
The 1215-line `pages/reader/index.tsx` monolith was reorganised so each mode is a self-contained sibling under the parent's orchestration:

```
pages/reader/
  index.tsx              parent: state, modals, dispatch (~950 lines)
  scroll-view.tsx        extracted virtualized scroll mode (no behaviour change)
  rsvp-view.tsx          existing word-by-word view
  page-view/
    index.tsx            sliding-window page mode (~650 lines)
    chunks.ts            Chunk type, buildChunks, findChunkForByte, visibleWindow, relativeOffsets, pageCountOf
    chunk-content.tsx    one mounted chunk (multicol container + paragraph rendering)
    measurements.ts      findPageForByte / readFirstVisibleByteOffset DOM helpers
  view-types.ts          shared ReaderViewHandle (jumpTo) for ref forwarding
```

Both `ScrollView` and `PageView` are `forwardRef` components exposing the same `jumpTo(byteOffset)` imperative handle, so the parent's chapter-/search-/highlight-list jumps work identically across modes via `scrollViewRef`.

### PageView design
- **Sliding 3-chunk window** (`prev / current / next`) all mounted side-by-side as absolutely-positioned children of a single transform wrapper. The translateX navigates seamlessly through all of them — within-chunk and cross-chunk page turns are now the same visual operation.
- **After cross-chunk settle** the window re-anchors via React state. Chunks that survive the shift keep their DOM (keyed by chunk index), so no relayout cost. The new far chunk pre-mounts in the background.
- **Size-driven chunking** at ~10 KB on paragraph boundaries (chapters intentionally NOT used as chunking unit — Standard Ebooks puts whole novels in single chapter elements). 10 KB chosen because, with 3 chunks always mounted, the user can't perceive chunk boundaries; smaller chunks just mean smaller per-mount work when re-anchoring (the cost users DO feel).
- **CSS multicol** with explicit pixel `width` / `height` / `columnWidth`. Required for `column-fill: auto` to overflow horizontally — chained `height: 100%` from IonContent has been observed to be "indefinite" enough for some WebKit/Blink builds to fall back to balance. Defensive fallback if multicol ever silently fails (estimates pageCount from scrollHeight).
- **3-layer DOM** (`.page-view` outer with reader margin → `.page-clip` for column-edge clipping → `.transform-wrapper`). The intermediary clip prevents CSS columns from bleeding into the outer padding region.
- **Pre-mount gate**: `isLayoutReady` (real pixel dimensions) gates the inner DOM. Without it, mounting 5000+ word spans into a 0×0 container during Ionic's page transition blocks the JS thread for 10+ seconds. This was a reproducible second-open freeze.
- **Direct-DOM transform writes** (`setTransform` bypasses React for pointermove updates so 60Hz drag doesn't reconcile N paragraphs; sets `transition` first then `transform` to avoid the snap-instead-of-animate race).
- **`isAnimatingRef` guard** on the transform-sync layout effect so it doesn't yank in-flight CSS transitions to a stop.
- **`completeInFlightAnimation`** for clean gesture interruption: starting a new pointer gesture during an animation cancels the timer, snaps the visual to the animation's target, and `flushSync`es the pending `onDone` (re-anchor or settle) so React state catches up before the new gesture reads it. Eliminates the "previous animation re-triggers" race.
- **Per-chunk active-offset scoping**: parent passes the real `activeOffset` only to the chunk that contains it; others get `-1`. Then within each chunk, the same scoping applies per-paragraph. Prevents N paragraphs from re-rendering on every tap.

### Gestures
- **Tap zones** (left third / right third / center) always win — including on word spans. E-ink reliability requires unambiguous page navigation. Word interaction moves to long-press.
- **Long-press** opens the existing selection toolbar. Single-word selections get a new "Look up" button that opens the existing `DictionaryModal` with the word (read directly from the rendered span's text, cleaned the same way the old double-tap path did).
- **Whitespace tap during selection** cancels via a new `onCancelSelection` callback (taps on word spans cancel via the existing click → `cancelSelection` path).
- **Horizontal swipe** with rubber-band resistance at the absolute first/last page; commits via `SWIPE_COMMIT_FRACTION` of pageWidth.

### Behaviours preserved
- Scroll mode behaviour is byte-identical to before the refactor (verified: skeleton-on-load, fine-scroll restoration, scroll-end position save, tap-word / long-press / drag-select, TOC + search jumps, RSVP toggle round-trip, hot reload mid-book).
- All existing modals (TOC, search, dictionary, highlight editor, highlights list, note input, appearance popover) work identically across modes.
- Cross-device cloud sync of `paginationStyle` works via the registry-driven sync mapper (no mapper code changes needed — the `satisfies` clause on `SYNCED_SETTING_KEYS` enforces parity with `SyncSettingsSchema`).

### Out-of-scope follow-ups (tracked)
- TASK-96 — page mode: cross-page selection drag (handle-drag past page edge auto-pages)
- TASK-97 — page mode: two-page spread on wide viewports
- TASK-98 — book language metadata for hyphenation (PageView's `lang="en"` is currently hardcoded with a TODO)

## Files added
- `packages/rsvp-core/src/settings.ts` — `PaginationStyle` type, `PAGINATION_STYLE` default, added to `SYNCED_SETTING_KEYS`
- `packages/rsvp-core/src/sync.ts` — `paginationStyle` in `SyncSettingsSchema`
- `apps/capacitor/drizzle/0014_pagination_style.sql` + journal entry
- `apps/web/drizzle/0002_pagination_style.sql` + snapshot + journal entry (regenerated via `drizzle-kit generate`)
- `apps/capacitor/src/services/db/schema.ts` — pagination_style column on settings
- `apps/capacitor/src/services/db/queries/settings.ts` — default plumbing
- `apps/web/src/db/schema.ts` — sync_settings column + check constraint
- `apps/capacitor/src/hooks/use-appearance-settings.ts` — paginationStyle + setter
- `apps/capacitor/src/pages/settings/appearance.tsx` — Pagination chip section
- `apps/capacitor/src/components/rsvp-pickers.tsx` — generic `ModeCards`, `READER_MODE_OPTIONS`, `PAGINATION_STYLE_OPTIONS`
- `apps/capacitor/src/pages/onboarding/steps/pagination-style.tsx` — new step
- `apps/capacitor/src/pages/onboarding/index.tsx` — `StepEntry[]` with `ownsFooter` flag, conditional pagination step
- `apps/capacitor/src/pages/reader/scroll-view.tsx` — extracted scroll mode
- `apps/capacitor/src/pages/reader/page-view/{index,chunks,measurements,chunk-content}.{ts,tsx}` — page mode
- `apps/capacitor/src/pages/reader/view-types.ts` — `ReaderViewHandle`
- `apps/capacitor/src/pages/reader/selection-toolbar.tsx` — `isSingleWord` prop, "Look up" button
- `apps/capacitor/src/pages/reader/selection-overlay.tsx` — passthrough
- `apps/capacitor/src/pages/reader/index.tsx` — slimmed to dispatch + state owner; new mode-toggle + page-word-tap + selection-lookup handlers
<!-- SECTION:FINAL_SUMMARY:END -->
