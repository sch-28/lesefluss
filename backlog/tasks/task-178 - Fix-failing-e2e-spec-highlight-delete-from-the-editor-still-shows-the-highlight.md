---
id: TASK-178
title: >-
  Fix failing e2e spec: highlight delete from the editor still shows the
  highlight
status: Done
assignee:
  - claude
created_date: '2026-10-01 12:04'
updated_date: '2026-10-01 12:31'
labels:
  - reader
  - e2e
dependencies: []
modified_files:
  - apps/capacitor/e2e/page-objects/reader.ts
  - apps/capacitor/src/services/db/hooks/use-highlights.ts
priority: medium
ordinal: 116000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Problem

`apps/capacitor/e2e/highlights-edit-delete.spec.ts` › "highlight delete persists across reload" fails deterministically, also on a clean checkout of `c1d1c9f` (verified in a separate worktree, 2/2 runs):

```
Error: word 5 still highlighted (class: word-highlight-yellow)
    at page-objects/reader.ts:147 (expectNoHighlight)
    at highlights-edit-delete.spec.ts:36
```

The failure is the first `expectNoHighlight` right after `deleteHighlightFromEditor` clicks Delete, before the library round-trip. The page snapshot at failure shows the "Highlight removed" toast already visible while the word span still carries `word-highlight-yellow`. The sibling test in the same file ("color edit persists across reload") passes.

## What is known

- `expectNoHighlight` in `e2e/page-objects/reader.ts` reads the span's `class` attribute once and throws; it does not retry, unlike Playwright's `expect(locator)` matchers.
- `handleSelectionDelete` in `src/pages/reader/use-highlight-selection.ts` fires `deleteHighlightMutation.mutate(...)` and `cancelSelection()`; the toast fires in `onSuccess`. The rendered highlight comes from `highlightsByParagraph`, derived from the highlights query, so the DOM only updates after the mutation's invalidation refetches.

## Outcome

The spec passes reliably, and a reader who deletes a highlight from the editor sees it disappear immediately. Decide whether this is a test-timing bug (the assertion must wait like `expectHighlight` does), a product bug (the delete should update the UI optimistically or the toast fires before the UI reflects the delete), or both, and fix at the right layer. Do not loosen the spec's intent: it must still prove the delete persisted across the reload.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `pnpm exec playwright test e2e/highlights-edit-delete.spec.ts` passes 3 consecutive runs
- [x] #2 After clicking Delete in the highlight editor, the word's highlight class is gone before the "Highlight removed" toast appears or at the latest when it appears
- [x] #3 The spec still verifies that the deletion persisted after the library round-trip
- [x] #4 Other highlight e2e specs (highlights, highlights-modes, highlights-order, highlights-note) still pass
- [x] #5 Root cause recorded in the task notes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Root cause: `expectNoHighlight` reads the class once, immediately after the Delete click, while the highlight is removed only after the delete mutation's `onSuccess` invalidates the highlights query and the refetch re-renders. `expectHighlight` retries for 10 s, which is why the sibling test passes. Secondary: the "Highlight removed" toast is fired from the per-call `onSuccess`, which runs as soon as the row is deleted, before the refetch, so the toast can precede the visual removal by a few ms.
2. Fix test layer: `expectNoHighlight` becomes a retrying assertion (`expect(locator).not.toHaveClass(/word-highlight-/)`), symmetric with `expectHighlight`.
3. Fix product layer: `useDeleteHighlight.onSuccess` returns the `invalidateQueries` promise so react-query awaits the refetch before the per-call `onSuccess` (the toast) runs. Same for the add/update hooks only if they share the pattern and it is a one-line change; otherwise leave them.
4. Run the spec three times, then the other highlight specs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: `expectNoHighlight` read the span class once, synchronously after the Delete click. The highlight is only removed after the delete mutation's `onSuccess` invalidates `bookKeys.highlights(bookId)` and the refetch re-renders `highlightsByParagraph`, so the one-shot read always saw the stale class. `expectHighlight` retries for 10 s, which is why the colour-edit test in the same file passed. Secondary product issue: the per-call `onSuccess` (the "Highlight removed" toast) ran before the refetch, because the hook's `onSuccess` fired `invalidateQueries` without returning its promise; react-query awaits a returned promise before running the caller's callbacks.

Fix: assertion now uses `expect(locator).not.toHaveClass(/word-highlight-/)` with a 10 s timeout; the add/update/delete highlight hooks return the invalidation promise so toasts follow the refetch. The spec's reload check is unchanged.

Verified: highlights-edit-delete 3/3 runs pass (6/6 tests), highlights / highlights-modes / highlights-order / highlights-note pass, hooks + reader unit suites pass, tsc and Biome clean.

Review round 2: `expect(locator).not.toHaveClass(...)` passes when the locator matches nothing, so the assertion now first requires `toHaveCount(1)` on the span. Spec re-run green.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed the deterministically failing e2e spec "highlight delete persists across reload".

- `e2e/page-objects/reader.ts`: `expectNoHighlight` is now a retrying Playwright assertion (`not.toHaveClass(/word-highlight-/)`, 10 s), symmetric with `expectHighlight`. It previously read the class once, before the delete's refetch could re-render.
- `src/services/db/hooks/use-highlights.ts`: the add, update and delete mutations return the `invalidateQueries` promise from `onSuccess`, so react-query awaits the refetch before per-call callbacks such as the "Highlight removed" toast run. The toast can no longer precede the visual removal.

Tests: target spec 3/3 runs, the four other highlight specs, hooks and reader unit suites, tsc, Biome. No behaviour change beyond toast ordering.
<!-- SECTION:FINAL_SUMMARY:END -->
