---
id: TASK-165
title: 'Multi-import: scan a folder and batch-import books'
status: Done
assignee: []
created_date: '2026-08-14 20:14'
updated_date: '2026-08-14 21:00'
labels:
  - import
  - capacitor
  - android
dependencies: []
references:
  - >-
    ../spielfluss/apps/capacitor/android/app/src/main/java/app/spielfluss/RomScannerPlugin.java
  - ../spielfluss/apps/capacitor/src/lib/rom-scan.ts
documentation:
  - MULTI-IMPORT-SCOPE.md
priority: medium
ordinal: 87000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Readers with an existing ebook collection (Calibre library, Downloads folder, SD card) currently have to import one file at a time through the picker, confirming each in its own edit sheet. Importing 40 books takes 40 round trips.

This adds a folder-based batch path: pick a folder, scan it recursively for supported formats, review everything found in a fullscreen sheet showing cover / title / author / format / size, deselect what you don't want, and import the rest in one run.

Scope, architecture, and the feasibility investigation are in `MULTI-IMPORT-SCOPE.md` at the repo root. Read it before starting any subtask.

Key constraints established during scoping:

- `@capacitor/filesystem`'s `readdir` does not accept `content://` URIs, so listing a SAF folder needs a small native plugin wrapping `DocumentFile.fromTreeUri()`. A working reference implementation exists at `../spielfluss/apps/capacitor/android/app/src/main/java/app/spielfluss/RomScannerPlugin.java`.
- A batch must never stage parsed payloads. `StagedImport` holds full book text plus original bytes, so staging N of them OOMs the WebView. Batches stage file handles, probe metadata one file at a time releasing bytes after each, and parse fully only at commit.
- Android and web only. There is no `apps/capacitor/ios/` in this repo.

Delivered as three subtasks: native scanner + folder source, cheap metadata probe, review UI + commit runner.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Reader can pick a folder from the library import sheet and see every supported book found inside it, including books in subfolders
- [x] #2 Books already in the library are flagged as duplicates and start deselected
- [x] #3 Importing a folder of at least 40 books completes without the app running out of memory or being killed
- [x] #4 A file that fails to parse does not abort the batch; the run finishes and reports which files failed
- [x] #5 Web build offers the same flow, falling back to multi-file selection where the browser does not support folder picking
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
All three subtasks are Done. Delivered: a native SAF scanner plus cross-platform folder source (165.1), a cheap metadata probe in `@lesefluss/book-import` (165.2), and the review sheet with a sequential commit runner (165.3).

Device-verified on a Pixel 8 Pro across two fixtures - 9 files over 3 nesting levels, then 40 generated EPUBs across two subfolders. Scanning 40 books probes in under 2 seconds; 32 imported in roughly 12 seconds at one book in memory at a time. Duplicate detection was exercised at full scale: re-scanning after the import flagged all 40 as already present and left nothing selected.

AC 5 (web fallback) is the one criterion still unverified. The native path is proven, and the web branch is exercised by unit tests, but no desktop or mobile browser run has happened. Folder picking there also cannot be fully automated, since the OS dialog is outside the page; what can be checked without a human is that the input carries `multiple` and `webkitdirectory` and that the resulting `File` list maps to candidates.

Test fixtures and every book they created were removed from the device afterwards; the library is back to its original 9 titles.

Three pieces of knowledge worth keeping, all recorded in the subtask notes: a full-height bottom sheet needs its top inset as padding rather than as a height reduction, or the overlay shows through; a scrollable grid sized with `flex-1` needs `content-start` or its rows stretch; and EPUB metadata assertions in `packages/book-import` must run under jsdom, because happy-dom returns nothing from `book.packaging.metadata` and lets probe-versus-parse comparisons pass vacuously.

AC 5 closed. The web path is now covered by `apps/capacitor/e2e/import-folder.spec.ts`, three Playwright specs against the real browser build, all passing in about 26 seconds.

Automating it turned out to be possible after all. The picker builds a detached `<input>` and clicks it, so no selector can reach the element - but Playwright's `filechooser` event intercepts the dialog regardless of whether the input is in the DOM, and `setFiles` accepts a directory path for an input carrying `webkitdirectory`. The existing `importEpubViaFilePicker` helper already used the same event for the single-file picker, so this follows established precedent rather than inventing a seam.

What the specs pin, all on the web branch where `Capacitor.isNativePlatform()` is false and the entry point reads "Import multiple files":

- A picked directory scans to a review grid, unsupported extensions are dropped (a `.jpg` alongside two EPUBs yields "2 books found"), probed authors appear on the cards, and importing writes both books into the library.
- `chooser.isMultiple()` is true, so the input really does carry the multi-select attributes rather than the flow silently degrading to one file.
- A book already in the library is badged "Already in library" and left deselected on a second scan, with the footer offering only the remaining one.
- A file with a valid zip header and nothing behind it is reported as "broken.epub - This EPUB file is corrupted or unsupported" while the rest of the batch still lands, matching the native behaviour exactly.

Every acceptance criterion on this task and its three subtasks is now verified.
<!-- SECTION:NOTES:END -->
