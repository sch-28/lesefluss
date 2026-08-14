---
id: TASK-165.2
title: Cheap metadata probe for scanned book files
status: Done
assignee: []
created_date: '2026-08-14 20:15'
updated_date: '2026-08-14 21:03'
labels:
  - import
  - book-import
dependencies: []
references:
  - packages/book-import/src/parsers/epub.ts
  - packages/book-import/src/parsers/pdf.ts
  - packages/book-import/src/utils/title-heuristic.ts
documentation:
  - MULTI-IMPORT-SCOPE.md
parent_task_id: TASK-165
priority: medium
ordinal: 89000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A batch review screen needs a cover, title, and author per candidate file, but fully parsing every file to get them is both slow and unsafe for memory. Add a probe path to `@lesefluss/book-import` that extracts only what the review screen shows and nothing else.

New export `probeBookMetadata(input, options)` returning `{ title, author, coverImage, format }`.

Per format:

- EPUB: open the archive, read the OPF metadata, and reuse the existing cover extraction. Skip the section iteration entirely, which is where nearly all the parse time goes. This requires splitting `parseEpub` in `packages/book-import/src/parsers/epub.ts` so open, metadata, and cover are callable without text extraction. The full parse must keep using the same code path so the two cannot drift.
- PDF: title and author from the document info dictionary. No cover: rendering a page costs more than the rest of a scan.
- TXT, MD, HTML: title from the existing filename heuristic. No cover.

Every format falls back to the filename when metadata is absent or unreadable, and a probe that throws must yield a name-only result rather than propagating, so one broken file cannot fail a scan of hundreds.

Callers probe one file at a time and release the bytes between files. This subtask owns the probe function and its tests; the caller-side sequencing lives with the batch UI.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Probing an EPUB returns the title, author, and cover the full parser would produce for the same file
- [x] #2 Probing an EPUB does not extract chapter text, and is measurably faster than a full parse of the same file
- [x] #3 Probing a PDF returns title and author from the info dictionary, or the filename when the dictionary is empty
- [x] #4 Probing an HTML document returns the title the parser would use, falling back to the filename when the document has none; TXT and MD return a filename-derived title. None of the three return a cover.
- [x] #5 A corrupt or truncated file yields a name-only result instead of throwing
- [x] #6 The existing full-parse output for every format is unchanged after the EPUB parser is split, verified by the existing parser tests
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Plan

### 1. Split the EPUB parser so metadata is reachable without text extraction

`parsers/epub.ts` currently does open, ready-race, metadata, cover, and the whole spine walk inside one `parseEpub`. Extract the first four steps:

- `openEpubBook(buffer)` — `assertLooksLikeZip` plus the `ePub()` + ready/timeout race, including the existing sink-catch that stops an abandoned `book.ready` becoming an unhandled rejection.
- `readEpubMetadata(book, fileName)` — title and author, with the existing filename fallback.
- `probeEpub(buffer, fileName)` — `openEpubBook` + `readEpubMetadata` + the existing `extractCover`, then `book.destroy()`. No spine iteration, no TOC walk.

`parseEpub` is rewritten to call the same two helpers, so the probe and the full parse cannot report different titles or covers. The existing epub tests are the regression check for that.

### 2. Same split for PDF

`parsers/pdf.ts`:
- `openPdfDocument(bytes, options)` — the defensive buffer clone and the `PDF_ENCRYPTED` mapping.
- `readPdfInfo(doc, fileName)` — the info-dictionary title and author with the filename fallback.
- `probePdf(bytes, fileName, options)` — open, read info, destroy. No page loop, no `renderCover`: rendering a page costs more than the rest of a scan.

### 3. Probe entry point

New `src/probe.ts` exporting `BookProbe` and `probeBookMetadata(input, options)`. Dispatches on `bookFormatForFileName`, and lazily imports the epub and pdf parsers the same way `parsers/registry.ts` does, so probing does not pull either into the main chunk.

TXT, MD, and HTML resolve to a filename-derived title with no cover. A new `titleFromFileName` helper in `utils/file-format.ts` strips the final extension, replacing the per-parser `replace(/\.md$/i, "")` idiom.

Every branch is wrapped so a throw degrades to a name-only `BookProbe` rather than propagating: one corrupt file must not fail a scan of hundreds.

### 4. Tests

New `__tests__/probe.test.ts` using the existing `buildEpub` fixture:
- EPUB probe returns the same title, author, and cover as the full parse of the same bytes (asserted against `epubParser.parse`, not against hardcoded values, so drift fails the test).
- EPUB probe on a fixture whose metadata is absent falls back to the filename.
- Corrupt bytes yield a name-only probe instead of throwing.
- TXT, MD, HTML return a filename title and a null cover.
- An unsupported extension still yields a usable probe rather than throwing.

PDF probing needs a pdfjs module and the existing suite has no PDF fixture; covered by the shared `probeBookMetadata` error path plus the unchanged `pdfParser` tests rather than a new synthetic PDF.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented. book-import 48 tests pass (11 new in `__tests__/probe.test.ts`), capacitor 541 pass, tsc clean in both.

Files: `src/probe.ts` (new, exported from the package index), `parsers/epub.ts` (split), `parsers/pdf.ts` (split), `utils/file-format.ts` (`titleFromFileName`), `__tests__/probe.test.ts` (new).

EPUB split: `openEpubBook` (zip check + ready/timeout race), `readEpubMetadata`, and `probeEpub` = open + metadata + the existing `extractCover`, no spine walk. `parseEpub` calls the same two helpers, so probe and parse cannot report different titles or covers. PDF split mirrors it: `openPdfDocument`, `readPdfInfo`, `probePdf`, no page loop and no `renderCover`.

Two findings from testing, both worth knowing:

1. The probe gets its own 5s `book.ready` budget instead of the parse's 15s. A truncated file keeps a valid zip header, so epubjs accepts it and then never settles; a scan of hundreds of files cannot afford 15s each. Measured `book.ready` on a 120-chapter EPUB at 26ms, so 5s is ~200x headroom and losing the race only costs the filename fallback. This is a deliberate divergence from the otherwise-shared path.

2. `probe.test.ts` runs under jsdom via a file-level `@vitest-environment` directive. Under happy-dom (the suite default) `book.packaging.metadata` returns nothing, so every title falls back to the filename and the probe-matches-parse assertion passes vacuously - both sides return the same wrong value. Verified directly: happy-dom gives `parse=ms/ probe=ms/`, jsdom gives `parse=Morning Star/Pierce Brown probe=Morning Star/Pierce Brown`. Anyone adding EPUB metadata assertions elsewhere in this package needs the same directive.

AC 3 is covered by injecting a stub through the existing public `loadPdfjs` option rather than hand-rolling a PDF fixture. The stub deliberately has no `getPage`, so a probe that reached for a page to render a cover would fail the test.

AC 2 is asserted by timing a probe against a full parse of the same 120-chapter fixture.

Fresh-context review pass (correctness + conventions reviewers). Fixed:

1. **Two tests were vacuous.** The EPUB and PDF filename-fallback tests asserted exactly the value the catch-all fallback produces, so they could not tell "the parser read an empty title" from "the probe threw and the catch swallowed it". The reviewer proved it by mutation: throwing at the top of both branches left both tests green. Both now also assert an author that only the real parser can produce. Re-ran the same mutation myself after fixing: both tests now fail under it, and 12/12 pass with it reverted.

2. **The 5s probe timeout is reverted; the probe and the parse share the 15s budget again.** My justification for the split was factually wrong. `book.ready` in epubjs 0.3.93 is `Promise.all([manifest, spine, metadata, cover, navigation, resources, displayOptions])` behind a full `JSZip.loadAsync`, i.e. unzip the whole file plus parse the entire TOC, not "container and OPF" as I claimed. A large EPUB on a slow WebView can legitimately land between 5s and 15s, in which case the probe would report a filename and the import that follows would commit the real title - exactly the drift the shared-code-path split existed to prevent. `EPUB_PROBE_READY_TIMEOUT_MS` and the `readyTimeoutMs` parameter are gone. Cost: the truncated-EPUB test now takes 15s of the suite's 15.8s. Correctness over suite speed; if that becomes painful, the fix is to bound total scan time in the batch runner, not to shorten the parser's timeout.

3. `openEpubBook` now calls `book.destroy()` before rethrowing. Pre-existing hole, but `probeEpub` is a new caller that runs it once per unreadable file in a folder, and the inflated JSZip archive stayed reachable through epubjs' pending continuations.

4. `probeEpub` returns `author: string | null` to match `probePdf` and `BookProbe`, instead of `author?: string` normalised at the call site.

5. `readEpubMetadata` and `readPdfInfo` now use `titleFromFileName` instead of hand-rolling `replace(/\.epub$/i, "")` and `replace(/\.pdf$/i, "")`. This change introduced that helper and then did not use it in the two functions it carved out.

6. `probeBookMetadata` takes a bytes-only input (`Extract<RawInput, { kind: "bytes" }>`). The old text branch invented a `"Untitled"` that no parser produces and that contradicted `textParser`, which uses the hint or `deriveTitle`.

7. Options are a named exported `BookProbeOptions` in types.ts, consistent with `ImportPipelineOptions`, so a consumer can name the type.

8. Added the missing `stubPdfjs(null)` case - pdfjs returning no info dictionary is a real path that `readPdfInfo` handles.

Open, deliberately not actioned: probing `.html` returns a filename title while `htmlParser` reads `<title>`/Readability's byline, so those two disagree for every HTML file that has a title. Fixing it changes AC 4, so it needs sign-off rather than a silent scope change. Raised with the user.

Not actioned, with reasons: `format` stays on `BookProbe` (a reviewer wanted it dropped as redundant with `ScannedFile.format`, but the probe is package-level API usable without a `ScannedFile`); the probe keeps its own dispatch rather than merging into `parsers/registry.ts`, though the reviewer is right that ignoring `mimeType` means a correctly-typed file with no extension probes as a stub; the wall-clock assertion in the speed test stays, since AC 2 asks for "measurably faster" and the structural alternative needs a fixture that can detect spine access.

Verified after fixes: tsc clean both packages, book-import 49 tests, capacitor 541 tests, biome clean.

AC 4 amended with the user's approval, and the HTML branch implemented.

The original wording ("TXT, MD, and HTML return a filename-derived title") was written on my false assumption that HTML carries no cheap metadata. It does: `htmlParser` takes its title from `article.title || doc.title || deriveTitle(content)`, so every HTML file with a `<title>` would have shown its filename on the review screen and a different title in the library after import. Not a race - it would happen every time.

`probeHtml` in `parsers/html.ts` decodes the bytes, reuses the module's own `ensureFullDocument` wrapper, and reads `doc.title`. Readability is deliberately not run: it is the expensive half, and `doc.title` is the parser's own second choice. Two consequences worth recording:

- A probed title can still differ cosmetically from the imported one, because Readability strips site-name suffixes ("Post | Blog" becomes "Post") while `doc.title` keeps them. That is a trimming difference, not the filename-versus-title mismatch the AC now forbids.
- Author still needs Readability's byline, so a probed HTML file reports a null author and the import may fill one in.

`BookProbeOptions` gained `domParser` so the probe can be driven with an injected parser like the pipeline can.

Tests: an HTML document with a `<title>` probes to that title; a titled document probes to exactly what `htmlParser.parse` returns (asserted against the parser, so the two cannot drift); an untitled document falls back to the filename. The TXT/MD cases now use a table of explicit expected values instead of recomputing the expectation with the implementation's own slicing rule.

14 tests in probe.test.ts.
<!-- SECTION:NOTES:END -->
