---
id: TASK-165.3
title: Batch import review sheet and sequential commit runner
status: Done
assignee: []
created_date: '2026-08-14 20:15'
updated_date: '2026-08-14 21:38'
labels:
  - import
  - capacitor
  - ui
dependencies:
  - TASK-165.1
  - TASK-165.2
references:
  - apps/capacitor/src/pages/library/import-sheet.tsx
  - apps/capacitor/src/pages/library/use-library-imports.ts
  - apps/capacitor/src/contexts/import-staging-context.tsx
  - apps/capacitor/src/services/book-import/commit.ts
documentation:
  - MULTI-IMPORT-SCOPE.md
parent_task_id: TASK-165
priority: medium
ordinal: 90000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The reader-facing half of folder import: choose what to keep from a scan, then import it.

Adds a fullscreen sheet driven by a state machine of scanning, probing, review, importing, done. It consumes the scanner from TASK-165.1 and the probe from TASK-165.2.

Review screen:

- A card per candidate with cover or format placeholder, title, author, format badge, size, and a selection checkbox.
- Format filter chips with live counts that toggle whole groups on and off.
- Select all and select none.
- Books whose normalized title already exists in the library are badged as duplicates and start deselected.
- Footer action reading `Import N books`, disabled when nothing is selected.

Probing is progressive: the grid renders from filenames immediately and each card fills in as its probe lands, so a large library stays browsable while the tail is still being read.

Commit runner, strictly sequential:

- Per book, read the handle, run the existing import pipeline, call `commitBook`, then drop every reference before the next book. Peak memory must stay at roughly one book. Batch imports skip the per-book edit sheet; readers edit afterwards from the book detail page.
- Progress shows position and current title, with a cancel that stops after the in-flight book. Books already written stay written.
- A file that fails is recorded and skipped, never fatal. A summary at the end lists what failed and why, reusing the existing import error-code to message mapping in `use-library-imports.ts`.
- Query invalidation and the sync push fire once at the end, not per book.
- The screen stays awake for the duration of the run.

Entry point: `import-sheet.tsx` gains a fourth source, labelled for folder import on native and multi-file selection on web where folder picking is unavailable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Choosing folder import from the library import sheet runs a scan and opens the review sheet
- [x] #2 The review grid renders as soon as filenames are known and fills in covers, titles, and authors progressively while probing continues
- [x] #3 Format chips show live counts and toggle every book of that format in one action
- [x] #4 Books matching an existing library title are badged and start deselected, and can still be selected manually
- [x] #5 Importing writes only the selected books, one at a time, and the library shows all of them when the run finishes
- [x] #6 Cancelling mid-run stops after the current book and keeps everything already imported
- [x] #7 A batch containing an unparseable file finishes the remaining books and reports the failure with the same message a single import would show
- [x] #8 Query invalidation and the sync push each happen once per run rather than once per book
- [x] #9 Backing out with the system back gesture behaves consistently with the other overlays in the app
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Plan

### 1. Shared error mapping (`pages/library/import-errors.ts`, new)

`use-library-imports.ts` owns `ERROR_TOASTS` and `ALERT_SUPPRESSED` as module constants. The batch runner needs the same code-to-message mapping for its failure summary. Move both plus an `importErrorMessage(err)` helper into a small module and have the existing hook import them. No behaviour change; avoids a second copy of the mapping.

### 2. Service layer (`services/book-import/batch.ts`, new)

Two thin compositions on top of what TASK-165.1 and TASK-165.2 delivered, keeping all IO out of the UI:

- `probeScannedFile(file)` - `readScannedFile` then `probeBookMetadata`, passing the app's `loadPdfjs`.
- `importScannedFile(file)` - `readScannedFile` then the existing parse-and-commit path, no overrides. Batch imports skip the edit sheet.

Both read one file at a time and hold nothing after returning.

### 3. State machine (`pages/library/batch-import/use-folder-import.ts`, new)

Phases: `idle` → `scanning` → `review` → `importing` → `done`.

Candidates are `ScannedFile` plus an optional `BookProbe`, a `selected` flag, and a derived `isDuplicate`.

- **Progressive probing.** The grid renders from filenames as soon as the scan returns; a sequential loop then probes each file and patches its card. An abort ref stops the loop when the sheet closes, so a dismissed scan does not keep reading files.
- **Duplicates.** Normalised-title match against the library. Computed from the best title known so far, so a card can become a duplicate when its probe lands, at which point it deselects itself. A `touched` set records manual toggles so a late probe never overrides a deliberate choice.
- **Import.** Strictly sequential. Per book: read, parse, commit, drop references. A cancel ref is checked between books, so cancelling stops after the in-flight one and everything already written stays. Failures are collected per file and never abort the run. Query invalidation and `scheduleSyncPush` fire once at the end.

### 4. UI (`pages/library/batch-import/`, new)

- `index.tsx` - fullscreen `Sheet` (side bottom, full height) routing on phase, with `pushBackHandler` so back closes the sheet rather than navigating, matching `import-staging-context`.
- `candidate-card.tsx` - cover or format placeholder, title, author, format badge, size, checkbox, duplicate badge. `draggable={false}` on the image, per the WebView long-press freeze.
- Format chips with live counts toggle whole groups; select all and none; footer reads `Import N books` and disables at zero.
- `useWakeLock(phase === "importing")`, same as the transfer modal.
- A `truncated` scan shows a banner saying the folder was larger than the scan ceiling.

### 5. Entry point

`import-sheet.tsx` gains a fourth source, labelled "Import folder" on native and "Import multiple files" on web. `library/index.tsx` owns the open flag and renders the sheet, mirroring how it already wires `ImportSheet` and `TransferModal`.

### 6. Tests

Unit tests for the pure parts, which is where the logic that can be wrong lives:
- duplicate detection: normalisation, and a candidate flipping to duplicate when its probe lands
- selection: format-group toggles, select all and none, and a late probe not overriding a manual toggle
- the commit runner: order preserved, a failing file does not stop the rest, cancel stops after the in-flight book, and invalidation fires once

The sheet itself is left to the device pass, as with TASK-165.1.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented and device-verified on a Pixel 8 Pro, driven over CDP.

Files: `pages/library/import-errors.ts` (extracted from `use-library-imports.ts`, no behaviour change), `services/book-import/batch.ts` (`probeScannedFile`, `importScannedFile`), `pages/library/batch-import/{candidates.ts,run-import.ts,use-folder-import.ts,candidate-card.tsx,index.tsx}`, plus the fourth source in `import-sheet.tsx` and wiring in `library/index.tsx`. 20 new unit tests; capacitor suite 561 green, tsc and biome clean.

Device run against a fixture of 9 files over 3 nesting levels, with a library that already contained "Morning Star" and "Red Rising":

- Scan found 5 importable books, including `Deep/A/B/deep.epub`, and excluded the dotfile and three unsupported extensions (AC 1).
- Format chips showed live counts (`epub 0/1`, `txt 0/1`) and the footer read "Nothing selected" at zero (AC 3).
- Both duplicates were badged "Already in library" and started deselected, one matched via probed EPUB metadata and one via filename (AC 4).
- Importing the three non-duplicates added 2 books and the library went 9 to 11 (AC 5).
- `deep.epub` (a 16-byte fake) failed without stopping the run, reported as "deep.epub - This EPUB file is corrupted or unsupported", the same wording a single import gives (AC 7).

**Safe-area bug found and fixed during the device pass.** The sheet had no top or bottom inset. Two causes, both in this component rather than the shared `Sheet`: `SheetContent` merges the caller's `className` last through tailwind-merge, so my `p-0` superseded its built-in `pb-[env(safe-area-inset-bottom)]`; and only `side="top"` carries `pt-[env(safe-area-inset-top)]`, because a bottom sheet is never expected to reach the status bar - my `h-[100dvh]` made it do exactly that. Fixed by dropping `p-0` and sizing to `h-[calc(100dvh-env(safe-area-inset-top))]`. Verified on device: sheet top lands at 60px (the measured top inset) with `padding-bottom: 25px` (the measured bottom inset). Worth remembering for any other full-height bottom sheet.

**Known gap, HTML without a `<title>`.** The review card shows the filename while the import commits `deriveTitle(content)`, the first line of text. Observed live: card read "notes", library row read "plain text book". TASK-165.2's probe reads `doc.title` and falls back to the filename, whereas `htmlParser` falls back to the first content line. This is the same class of mismatch AC 4 of TASK-165.2 was amended to prevent, surviving in the narrower title-less case. Closing it properly means the probe extracting body text, which is the cost the probe exists to avoid. Left open for the user to decide rather than silently widening scope.

AC 2, 6, 8, and 9 are deliberately left unchecked. AC 6 (cancel) and the ordering guarantees behind AC 8 are covered by `run-import.test.ts`, but the cancel path was not exercised on device because both test files imported faster than a tap. AC 2's progressive fill was observed as populated cards rather than measured mid-scan. AC 9 (back gesture) mirrors the `import-staging-context` handler by construction but was not tapped through on device. All four want a device pass with a larger folder.

Two more layout bugs found on device, both fixed and re-measured.

**Sheet was not truly fullscreen.** The first inset fix sized the sheet to `100dvh` minus the top inset, which shrinks the element rather than padding it, so the dialog overlay showed through above it as a black band. Correct shape: keep the sheet at full `100dvh` and apply `pt-[env(safe-area-inset-top)]` as padding, so the background reaches all four edges while content stays clear of the status bar. Also dropped the drag handle (decorative - a Radix sheet is not draggable) and the built-in close button (absolutely positioned at `top-3`, so it would sit under the status bar); the header carries its own X, hidden mid-run so a partial batch cannot be stranded. Measured: sheet spans 0 to 1173 on a 1173 viewport, padding 60px top and 25px bottom, square corners, title at y=76.

Sheet was kept rather than converting the flow to a route: it is a Radix Dialog underneath, so fullscreen is pure styling, and a route would give a transient modal task a URL plus router-owned back handling, diverging from `BookEditSheet` and `TransferModal`.

**Grid rows stretched.** With `flex-1` the grid is taller than its content until it fills up, and a grid's default `align-content: normal` resolves to stretch, so two rows of cards inflated to 447px and 427px against a natural ~300px. The card's `aspect-2/3` cover cannot fill that, so the slack rendered as a large dead gap under each row. Fixed with `content-start` and `auto-rows-min`. Measured after: rows 319px and 299px, `align-content: flex-start`, and the actual spacing between row one's bottom and row two's top is exactly the 12px `gap-3`.

Worth carrying forward: any scrollable grid sized with `flex-1` needs `content-start`, and any full-height bottom sheet needs the top inset as padding rather than as a height reduction.

Fresh-context review pass (correctness/hooks/async + conventions/structure). 7 findings, all fixed. Both reviewers confirmed the repo was left clean.

**Three real bugs from the correctness pass:**

1. **The HTML title fix was half-wrong, and I introduced it.** `deriveTitle` stamps the current local time when the first line exceeds 80 chars, which prose paragraphs routinely do. So a probe at 10:31 and the import at 10:33 produced different titles, and `normalizeTitle` could never make them compare equal - the exact failure the fallback was added to close. Split `firstTitleLikeLine` out of `deriveTitle`; `probeHtml` uses that and returns null at the prose branch, so the caller falls back to the filename deterministically. Residual, documented: a title-less prose document probes to its filename and imports under a timestamp. Both are junk names, but they no longer pretend to agree.

2. **The probe loop kept running through the import run.** `probeAll` was fire-and-forget and only stopped on unmount, while the Import button was enabled whenever anything was selected. Starting an import mid-scan therefore had one file being probed while another was being parsed and committed - two whole files resident, up to `MAX_IMPORT_BYTES` each, which is precisely the peak the sequential runner and its comments exist to prevent. Added `probesPausedRef`, set before the first read in `beginImport` and checked at both of `probeAll`'s checkpoints. Unprobed cards keep their filenames, which is the right trade against an OOM.

3. **Duplicate candidate keys on mobile web.** `candidateKey` was `relativePath`, which is unique on native and desktop web but degrades to the bare filename on browsers that ignore `webkitdirectory` - the exact path the "Import multiple files" label exists for. Multi-selecting two same-named files from different folders then stamped one file's probe onto the other, toggled both from one tap, and rendered duplicate React keys. `ScannedFile` now carries an `id` assigned in `toScannedFiles`, and everything keys off that. Regression test in `folder-scan.test.ts`.

**Four from the conventions pass:**

4. `index.ts` was exporting `pipelineOptions` and `parseAndCommit` purely so `batch.ts` could reach them, while re-exporting `batch.ts` itself - a barrel importing its own consumer, and the subsystem's private pdfjs wiring exposed to every caller. Moved `parse`, `parseAndCommit`, `pipelineOptions`, and `loadPdfjs` into `services/book-import/pipeline.ts`. Cycle gone, `pipelineOptions` private to the two files that need it.

5. `batch.ts`'s doc comment claimed `probeScannedFile` never throws. `readScannedFile` throws `FILE_TOO_LARGE`/`FILE_READ_FAILED` before the probe is reached; only the probe itself is total. Corrected, since that is exactly the contract a future caller would trust and skip the catch for.

6. `candidate-card.tsx` had a third byte formatter in `pages/library/`, disagreeing with the shared `transfer-modal/utils.ts` one (1024-base vs 1000-base), so two cards in the same feature formatted the same size differently. Now imports `formatBytes`, following the precedent `book-file-card.tsx` already set.

7. `toExistingTitles` moved out of the hook module into `candidates.ts`, so `library/index.tsx` no longer imports a `use-*` module to get a non-hook function.

Both reviewers independently noted `use-folder-import.ts` has no direct test, and that `renderHook` appears nowhere in this repo. The two behaviours the pure tests structurally cannot reach are the abort guard in `probeAll` and the invalidate-once-per-run rule. Worth knowing if this area grows.

Verified after fixes: tsc clean both packages, book-import 53 tests, capacitor 562 tests, biome clean, debug build installed.

Second device pass with a realistic fixture: 40 generated EPUBs (25 chapters and a cover each) split across two subfolders, so the flow lasts long enough to observe. Closes the four criteria the 2-file fixture could not reach.

**AC 2, progressive fill.** Sampled the grid every 120ms from the moment the scan returned, 243 samples. All 40 cards were present in the first sample while 23 files were still unprobed; covers filled in 17 to 32 to 40 as the counter ran 23 to 8 to 0. Card positions produced exactly one distinct layout across every sample, so nothing shifted as metadata landed - the reserved title and author heights plus the always-rendered status line hold.

**AC 6, cancel.** Tapped "Stop after this book" while the progress read 31 of 40. Result: "Added 32 books before stopping" - the in-flight book completed and was kept, and the run stopped rather than tearing down mid-write. Library then showed 43 (11 before the run plus 32), so nothing already written was lost.

**AC 9, back gesture.** Pressing system back on the finished sheet closed it and left the app on `/tabs/library` rather than navigating the page behind it, matching `import-staging-context`.

**AC 8, single invalidation.** Verified by inspection rather than instrumentation: `invalidateQueries` and `scheduleSyncPush` have one call site each, after the loop in `beginImport`, and the correctness reviewer independently traced all four exit paths (success, partial failure, cancelled-with-writes, all-failed-with-zero-writes) plus the unmount-mid-run case. The device run is consistent with it - the library refreshed once, on completion - but a per-book invalidation would also have looked like that from outside, so this one rests on the code and the reviewer's trace, not on an observation.

Also confirmed at scale: a 40-book scan probes in under 2 seconds, and 32 books imported in roughly 12 seconds with the screen held awake.

One fixture note for anyone reproducing this: the generated covers render as flat red because the embedded PNG is a single red pixel scaled by `object-cover`. That is the fixture, not the cover pipeline; a real EPUB renders its own artwork.
<!-- SECTION:NOTES:END -->
