---
id: TASK-167
title: >-
  Bulk actions in the library: select many books, then delete, set status, or
  tag
status: Done
assignee: []
created_date: '2026-08-14 20:16'
updated_date: '2026-08-14 22:18'
labels:
  - capacitor
  - library
  - qol
dependencies: []
references:
  - apps/capacitor/src/pages/library/index.tsx
  - apps/capacitor/src/services/db/hooks/use-books.ts
  - apps/capacitor/src/pages/library/batch-import/candidates.ts
priority: medium
ordinal: 92000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Folder import can now add forty books in one gesture, but every action afterwards is single-book: clearing out a batch of forty means forty rounds of long-press, Delete, confirm. Tagging a freshly imported series is the same slog.

Adds a selection mode to the library grid and list, with the three actions a multi-book edit is actually for.

Entry and interaction, decided with the user:
- The existing long-press menu gains a "Select" action, which enters selection mode with that book already selected. The menu keeps its current single-book actions.
- Once selection mode is active a plain tap toggles a card. Long-press does nothing further; it is only the way in.
- Series cards are not selectable in this version. They are containers for serial chapters rather than books, and deleting one is already its own confirm flow.

Actions: delete, set reading status, add or remove tags.

Two constraints carried over from the batch importer, which hit the same shape of problem:
- `useDeleteBook` and `useUpdateBook` each fire a toast, invalidate queries, and call `scheduleSyncPush()` per book. Looping them over a selection would produce one toast and one sync push per book. Bulk needs its own mutations that do the work per book and then invalidate, push, and report once.
- A failure on one book must not abandon the rest of the selection.

Tag storage is a JSON string per book, with `parseBookTags` / `serializeBookTags` in `@lesefluss/core` and a 2000 character cap enforced in `book-edit-sheet.tsx`. Bulk tagging has to respect the same cap.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Long-pressing a book offers Select, which enters selection mode with that book selected
- [x] #2 In selection mode a plain tap toggles a book's selection, and does not open the reader
- [x] #3 The header shows how many books are selected and offers select-all and a way out
- [x] #4 Deleting a selection removes every selected book, reports once rather than once per book, and leaves the rest of the library untouched
- [x] #5 Setting a status applies it to every selected book in one action
- [x] #6 Adding a tag applies it to every selected book, and removing one clears it from every selected book that had it
- [x] #7 A tag that would push a book past the tags length limit is not added to that book, and the rest of the selection still succeeds
- [x] #8 One book failing does not abandon the remaining books in the selection
- [x] #9 Query invalidation happens once per bulk action rather than once per book
- [x] #10 Leaving selection mode by the system back gesture returns to the normal library rather than navigating away
- [x] #11 Series cards are not selectable and cannot be caught up in a bulk action
- [x] #12 A book selected before a filter or search change stays selected even while hidden
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Planned in plan mode; approved plan saved at ~/.claude/plans/sharded-giggling-raven.md.

AC 9 amended. It previously said the sync push must happen once per bulk action, which is not a real requirement: `scheduleSyncPush` (`services/sync/index.ts:1199-1209`) is debounced on a single module timer, so forty calls already collapse to one push. What genuinely repeats per book today is query invalidation, and `useDeleteBook` invalidating `bookKeys.all` per book would refetch the whole library and every cover once per deleted book.

AC 12 added to pin the keep-hidden selection semantics the user chose.

Delivered in two phases as subtasks: selection mode with delete and status first, tags second.

Fresh-context review pass over phase 1: three reviewers (correctness/hooks/async, conventions/structure/tests, and a dedicated data-safety pass). All three confirmed they left the repo clean. The data-safety dimension was added deliberately because this is the first feature in the app that can destroy many books at once, and the deletes tombstone and propagate to every device.

**Data-loss bugs found and fixed, in order of severity:**

1. **`queries.deleteBook` cascaded children before tombstoning the row.** The four statements are not a transaction. A failure after the children were deleted but before the tombstone left a book that still looked alive locally with its highlights, glossary entries and content gone - and because the next push is a full snapshot, the server tombstones every highlight missing from it (verified at `apps/web/src/routes/api/sync.ts:421-439`, `notInArray(highlightId, pushIds)`). So a half-finished delete permanently destroyed that book's highlights on the server and every other device, while telling the reader the delete had failed. Pre-existing, but bulk turns one window into N. Fixed by tombstoning first: a half-finished delete now leaves harmless orphan rows instead.

2. **`removeBook` unlinked the file before touching the DB**, so a throwing `deleteBook` left a surviving book whose only local copy was gone - unopenable and unre-parseable, with no server copy for a no-account user. Rows now go first.

3. **Bulk status wrote to books already at that status.** `status` is a `METADATA_COLUMNS` member, so every write stamps `metadataUpdatedAt`, and sync merges the entire reader-editable group (title, author, description, language, status, rating, review, tags) behind that one stamp. Selecting 40 books including one already at the target status would push a stale rating and review over a newer edit made on another device. Now skipped, mirroring what the tags branch already did.

**Correctness bugs fixed:**

4. Back during a bulk run was not blocked, it was *forwarded*: deactivating the handler let `consumeBackPress` return false, so the router navigated away (or the app exited on a cold start into the library), unmounting the page mid-delete so the failure summary landed on a dead component and the reader was told nothing. The handler now stays registered during a run and swallows the press.

5. `useBackHandler` had `handler` in its dependency array while one call site passed an inline arrow, so it re-registered on every render of a page that re-renders constantly - hoisting itself above overlays that opened later, exactly the hazard its own docstring warned about. The handler is now held in a ref and only `active` can re-register.

6. A hold spanning the end of selection mode opened the reader: `onClick` ran the *current* meaning of a tap, so a bulk run finishing mid-hold turned a deselect into a navigation. The tap handler is now latched at touchstart, so a gesture completes under the semantics it began with.

**Also fixed:** the all-failed headline said "Couldn't update" for a delete (and the test cemented it); "and 2 books more" read as nonsense; `removeQueries` evicted the whole selection rather than only the books that went; the dead `tags` variant and `TAGS_FULL` were removed until the phase that uses them; the dead `abortRef` cancellation was removed rather than left looking wired; `run-sequential`'s doc named `deleteLibrary` as its motivation despite that loop never being converted; `NO_PROGRESS` was duplicated and `BatchProgress` was an alias colliding with an unrelated type; `bookCount` is now shared instead of written out four times; the barrel now follows the namespace convention its ten siblings use; `run-import.test.ts` was cut to the three adapter-specific cases now that the generic suite owns sequencing.

Verified after fixes: tsc clean, 586 tests pass, biome clean.

Phase 1 finished: selection mode with bulk delete and bulk status. AC 4, 6 and 7 stay open for the tags phase and a device delete.

**Refactor.** `index.tsx` went 844 to 687 lines. `use-library-selection.ts` owns the state machine (selection, sheets, delete dialog, failure summary, both back handlers, and the run), with `bulk-action-bar.tsx` and `bulk-sheets.tsx` for the UI. This follows the rule `use-library-imports.ts` states in its own docstring, and gives the tag sheet somewhere to land in phase 2.

**Delete confirm names the books** rather than only counting them, truncated to five plus "and N more". That is what makes the keep-hidden selection honest: the reader sees the actual titles, including ones a filter has scrolled out of view, without a separate warning. Verified on device reading exactly "Delete 3 books? / East of Eden / Mistborn / Golden Son". This also exposed a latent bug - `ConfirmDialog` rendered `\n` as spaces, so the failure summary would have been one run-on line; it now sets `whitespace-pre-line`.

**Tests.** 596 capacitor unit tests (+10: `titleList`, `bookCount`, and a `use-bulk-books` suite pinning the per-book work, including that a book already at the target status is skipped - the metadata-clobbering fix from the review). Six new Playwright specs in `library-bulk-select.spec.ts`: Select entry, tap-toggles-without-navigating, select-all under a search with hidden picks surviving, delete naming the books and removing exactly those, status round-tripped through the filter, and exit restoring normal tap behaviour.

**Three pre-existing e2e failures found and fixed, unrelated to this work.** `importEpubViaFilePicker` never accepted the import confirm sheet, so it asserted on a title that is an input *value* rather than page text - passing while a modal still covered the library and breaking anything that followed. `openBookFromLibrary` and `book-detail-chapter-jump` then used `getByText(title).first()`, which can resolve into a closed-but-still-mounted sheet where a click never reaches the card. All three now target the card's `data-book-title`. These broke when the import confirm sheet shipped earlier today, and stayed invisible because the line reporter's ANSI rewrites mangled the summary and my runs piped Playwright through `tail`, which replaces its exit code with tail's. Full suite now reports 48 passed with a genuine EXIT=0.

**Still unverified:** a real bulk delete on device. Playwright covers it on the web build, where `Filesystem` is a no-op, so the reordered `removeBook` (rows before file) has not run on hardware - and that reorder exists specifically to protect the on-disk file when the DB delete throws.

Phase 2 done: bulk tags.

**Model.** `bulk-tags.ts` holds the pure logic. A tag is `all` / `some` / `none` across the selection, and the reader edits an *intent* (`add` / `remove` / `leave`) rather than a state, because "put this on everything" and "take this off everything" both have to be expressible whatever the current mix is. The cycle is arranged so the first tap always does the obvious thing: add where the tag is missing, remove where every book already has it. `applyTagIntents` removes before adding and preserves each book's existing order; `tagPatchFor` returns `changed: false` for a book that already matches, so a tag applied to 40 books where 30 have it writes 10 rows rather than 40 - each write would otherwise stamp `metadataUpdatedAt` and enlarge the sync payload.

**The length cap.** `clampBookTags` was extracted from `clampToFieldLimits` in `book-edit-sheet.tsx` so the bulk path and the edit sheet share one implementation rather than two that can drift. Because adds append at the end, the greedy clamp drops exactly the newly added tag, and that book is reported as a failure ("Too many tags on this book") with no write at all - all-or-nothing per book, since applying one of two requested tags is harder to explain and to retry than leaving it alone.

**Sheet.** `bulk-tag-sheet.tsx` lists the union of the selection's tags and the library's, so an existing tag can be applied without retyping it, with a per-row hint ("On 3 of 12", "Add to all", "Remove from all") and a free-text field that mints a new tag already set to add. Apply is disabled until at least one row would act.

**Tests.** 615 unit tests (19 new in `bulk-tags.test.ts`, covering tri-state derivation, the intent cycle from each state, order preservation, the no-op short-circuit, last-tag-removal writing null rather than "[]", a malformed tags column being ignored, and the overflow branch). Two new Playwright specs round-trip add and remove through the tag filter, which reads committed rows rather than sheet state. Suite is 8/8.

**Device-verified** on a Pixel 8 Pro: the sheet opened on an untagged library with its empty state, a new tag showed "Add to all" before applying, applying put it on exactly the two selected books and made a TAGS group appear in the filter, reopening the sheet showed "On all" so the first tap offered "Remove from all", and applying that cleared it from both. The temporary tag was removed again, so the library is exactly as it was found.

A useful side effect of that last step: when the tag disappeared, the stored tag filter self-healed to empty and the library went back to all 9 books - the `!isPending` guard and stale-tag cleanup from TASK-166 working in the wild.

AC 4 confirmed by the user on device. Every criterion on this task is now verified.

Recording the attribution plainly: I did not run a bulk delete on hardware myself. It stayed open because exercising it needed throwaway books, and the reordered `removeBook` (rows before file) only runs on device - `Filesystem` is a no-op in the web build that Playwright drives.

Second review pass, covering what the first one predated: the refactor, the delete confirm listing titles, and all of phase 2. Three fresh-context reviewers again (correctness/React state, conventions/structure/tests, data safety); all three left the repo clean. 20-odd findings, all but one fixed.

**Real bugs, none of which the phase-1 review could have seen:**

1. **A book already over the tag cap could not have tags removed.** `tagPatchFor` clamped unconditionally, so a pure removal threw `TAGS_FULL` - the one action that could bring the book back under the limit was the only one refused. Now overflow is only considered when the intents actually added something.

2. **Stale tag intents survived a close and were applied to a different selection.** The sheet never unmounts, and the Android back handler closes it by flipping the `isOpen` prop, which never runs the sheet's own close path. Staging "add sci-fi", backing out, then selecting different books reopened the sheet with the intent still armed and Apply enabled. Reset now keys off `isOpen`, following the precedent already in `book-edit-sheet.tsx`.

3. **A typed-but-uncommitted tag was silently discarded by Apply**, and Apply stayed disabled for it, with nothing indicating that Enter or + was required. Apply now commits the draft, so what is on screen is what gets applied.

4. **The delete confirm had no back handler**, so back fell through to the selection handler and wiped a selection built across several filters - two levels instead of one.

5. **A bulk run outlived the page.** Back was already swallowed during a run, but the tab bar was not: switching tabs unmounts the library while `runSequential` keeps going, so the failure summary landed on a dead component. The headline now always goes through the module-level toast, which survives the unmount; the dialog adds the detail when the page is still there.

6. **A sync pull landing mid-run could be overwritten and re-stamped**, so a tag or status edit from another device would disappear everywhere. Each book's row is now re-read from SQLite immediately before its patch is computed, which also fixes the status skip silently skipping a book the pull had just changed.

**Layering.** `use-bulk-books.ts` imported a type from `pages/library/bulk-tags.ts` - the only `services/ → pages/` import in the app, and transitively a UI import, since `bulk-tags.ts` pulled `clampBookTags` out of a component file. `TagPatch` now lives beside the action that consumes it, and `FIELD_LIMITS` + `clampBookTags` moved to `pages/library/book-fields.ts`. `TagPatch` also gained a real discriminant (`unchanged` / `write` / `overflow`) instead of `changed: true` covering both writing and refusing.

**Two tests were not testing what they claimed**, both proven by the reviewer:
- The "does not duplicate a library tag" case asserted only the keys, which a Map makes unique for free, so it could not fail; it passed with the guard it was named for deleted. It now asserts the whole rows, where deleting that guard resets a count and a state.
- The overflow fixture was ~2x over the cap before the added tag, so it passed even if the addition contributed nothing. Sized by measurement instead: 62 tags serialise to 1975 chars and the added tag takes it to 2009. Worth noting the reviewer's own arithmetic was wrong here too - their suggested tag was short enough to stay under - so I measured rather than took it.

**Also:** `aria-pressed` removed from the tag rows (a boolean cannot express add vs remove, and it announced "not pressed" for a tag already on every book); the state is now in the row's accessible name. `maxLength` on the tag input. `availableTags` memoised, and the sheet's row derivation gated on `isOpen`, since it parses every picked book's tags JSON and the sheet is always mounted. `useBulkBookActions` no longer exported directly, matching its twelve siblings. `UseLibrarySelection` exported and used as the prop type rather than `ReturnType<typeof …>`. `MAX_LISTED_FAILURES` renamed now that it also caps the delete list.

**Verified:** tsc clean, 626 unit tests, 10/10 selection e2e including the mixed tri-state (the reason the tri-state exists, previously untested) and a stale-intent regression.

**Not fixed, needs a product decision:** a bulk metadata write stamps `metadataUpdatedAt`, and sync merges the whole reader-editable group behind that stamp. If this device has not pulled recently, one tag applied to a large selection can push stale nulls over a rating or review set on another device. Pre-existing, but this materially widens it: before, only the single-book edit sheet could stamp that group, one deliberate gesture at a time with the values visible. The fix is to pull before a bulk metadata run and recompute, which has offline and latency consequences worth deciding rather than assuming.
<!-- SECTION:NOTES:END -->
