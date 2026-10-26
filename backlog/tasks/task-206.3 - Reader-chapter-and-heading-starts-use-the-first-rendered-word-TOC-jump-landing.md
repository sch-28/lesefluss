---
id: TASK-206.3
title: >-
  Reader: chapter and heading starts use the first rendered word (TOC jump
  landing)
status: Done
assignee: []
created_date: '2026-10-26 03:15'
updated_date: '2026-10-26 03:15'
labels:
  - reader
  - bug
dependencies:
  - TASK-208
modified_files:
  - packages/core/src/word-index.ts
  - packages/core/src/__tests__/word-index.test.ts
  - apps/capacitor/src/pages/reader/index.tsx
  - apps/capacitor/src/pages/reader/scroll-view.tsx
  - apps/capacitor/src/pages/reader/chapter-headings.ts
  - apps/capacitor/src/pages/reader/chapter-headings.test.ts
  - apps/capacitor/src/pages/reader/page-view/measurements.ts
  - apps/capacitor/src/services/db/queries/books.ts
  - apps/capacitor/src/services/db/hooks/use-books.ts
  - apps/capacitor/src/services/rsvp-format/builder.ts
  - apps/capacitor/src/services/rsvp-format/__tests__/v2-roundtrip.test.ts
  - apps/capacitor/src/utils/chapters.ts
  - apps/capacitor/src/utils/__tests__/chapters.test.ts
  - apps/capacitor/src/hooks/use-book-chapters.ts
  - apps/capacitor/src/pages/library/book-detail.tsx
  - apps/capacitor/src/pages/library/book-chapters.tsx
  - apps/capacitor/src/pages/social/buddy-read.tsx
  - apps/capacitor/src/pages/social/buddy-read-discussion.tsx
  - apps/capacitor/src/pages/social/discussion-chapters.ts
  - apps/capacitor/src/pages/social/__tests__/discussion-chapters.test.ts
  - apps/capacitor/src/services/sync/book-merge.ts
  - apps/capacitor/src/services/sync/index.ts
  - apps/capacitor/src/services/sync/__tests__/book-merge.test.ts
  - apps/capacitor/src/services/db/__tests__/book-merge-apply.test.ts
  - apps/capacitor/e2e/position-toc-heading-landing.spec.ts
  - apps/capacitor/e2e/helpers/chapter-novel.ts
  - apps/capacitor/e2e/jump-settle-guard.spec.ts
  - apps/capacitor/e2e/chapter-jump-first-word.spec.ts
  - apps/capacitor/e2e/scroll-mode-appearance-anchor.spec.ts
  - apps/capacitor/e2e/page-objects/reader.ts
  - apps/capacitor/e2e/position-reopen.spec.ts
  - apps/capacitor/e2e/position-late-resize.spec.ts
  - apps/capacitor/playwright.config.ts
parent_task_id: TASK-206
priority: high
ordinal: 180200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Confirmed at normal frame rate (24/24 cases): a TOC jump in scroll mode to a chapter that starts with a `#` heading lands with the previous chapter's last word at the top and the heading ~69 px below; "Read from here" then saves the previous chapter's last word (e.g. 2489 instead of 2490). Seen on Morning Star as well (55121 instead of 55146).

Cause: WordIndex.wordOf floors. The `#` byte is not a word, so (1) paragraphStartWords (pages/reader/index.tsx) makes a heading paragraph "start" at the previous paragraph's last word, and (2) the TOC chapter startWord (services/db/queries/books.ts, wi.wordOf(ch.startByte)) is floored too. With that target, ScrollView.jumpTo's heading path doesn't apply and fineScrollTo pins the previous word to the top. jump-settle-guard.spec.ts masks it (accepts saved >= openingWord - 5).

Fix: use ceiling semantics (the first word actually rendered in the paragraph/chapter) for chapter starts, paragraph starts used for headings, and anything derived (figure anchors). Check page mode and RSVP chapter jumps, the book-detail chapter jump and chapter progress calculations for the same floor. Tighten jump-settle-guard.spec.ts.

Repro: scratchpad repro-v1/apps/capacitor/e2e/repro-scroll-toc-heading-landing.spec.ts + helpers/repro-novel.ts; port it into the repo.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Ported regression spec (h1/h2, two chapters, phone + wide): the heading lands at the top (within a few px) and Read from here saves the chapter's first word (red before, green after)
- [x] #2 jump-settle-guard.spec.ts asserts the exact chapter start instead of >= openingWord - 5
- [x] #3 Page mode, RSVP and book-detail chapter jumps land on the chapter's first word (spec or unit test each)
- [x] #4 Real Chrome: TOC jump to a Morning Star chapter lands with the heading at the top and saves the heading/first word
- [x] #5 Full capacitor e2e suite, vitest, tsc, biome pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-26 from the 206.1 real-Chrome recheck (1 fps window): a wheel made during a TOC jump's landing (which takes seconds at 1 fps) is overridden by the landing's fine align and the open/jump hold, putting the view back on the target. HEAD behaves the same (pre-existing; at normal frame rates the landing takes ~100 ms). While touching the jump landing here, consider letting real input during a landing cancel the jump's fine align (it must still never save the half-landed word).

2026-10-26 (lese-worker), parked for the TASK-206.2 / TASK-208 review fixes. State so far:

Done (in tree):
- core: WordIndex.wordAtOrAfter(byte), the first word starting at or after a byte (wordCount past the end), with unit tests in word-index.test.ts.
- reader index.tsx paragraphStartWords uses it (clamped to the last word), so a heading paragraph starts at its own first word.
- queries/books.ts: new imports store chapter startWord via wordAtOrAfter; the image-anchor firstWordAtOrAfter helper is replaced by it.
- rsvp-format/builder.ts: paragraph and chapter word indices via wordAtOrAfter.
- scroll-view.tsx findAlignmentSpan falls back to the paragraph's [data-heading-word] (a heading renders no word spans); the hold's findWordSpan uses it.
- Ported spec e2e/position-toc-heading-landing.spec.ts + e2e/helpers/chapter-novel.ts (8 cases). Red before: 8/8 failed (the previous chapter's last line visible). Green after, together with jump-settle-guard: 9/9.

Open:
- Chapters already stored floored (old imports; server copies pulled by new devices carry them too). Plan: repair from the word index (a floored start is a word that is its paragraph's last word, i.e. the next word starts a paragraph): in the reader on open (persist locally, no revision), in book-detail's chapter jump, and at pull insert. Still to decide whether a one-time migration is needed.
- jump-settle-guard exact assertion (AC#2); page mode / RSVP / book-detail checks (AC#3); chapter progress, reading goals/sessions, buddy-read markers; real Chrome on Morning Star (AC#4); wheel during a 1fps landing (note above).
- Found, out of scope: book-sync-context parseChapters reads {title,startByte}, but DB chapters are {title,startWord}, so BLE uploads carry 0 chapters.

2026-10-26 resumed and finished (lese-worker), for review.

Starts use ceiling semantics: WordIndex.wordAtOrAfter (core) gives the first word starting at or after a byte. It is used for:
- the reader's paragraphStartWords;
- the import's chapter startWord and image anchors (it replaces the local firstWordAtOrAfter);
- the RSVP device builder's paragraph and chapter indices.
findAlignmentSpan falls back to the paragraph's [data-heading-word], so a jump or hold onto a heading aims at the heading element.

Chapters already stored floored are repaired at read time (no migration), via utils/chapters.ts chaptersOnShownWords and the hook hooks/use-book-chapters.ts.
- Why read time: server copies of those chapters keep reaching new devices (pull inserts the server's JSON as is), so a one-off migration would miss them. And chapters JSON is only pushed for new books, so a local rewrite would never reach the server anyway. The repair is deterministic, so every device and every buddy-read member derives the same starts.
- Rule: a stored start is floored when it is not its own paragraph's first word, and the next word opens a heading paragraph with only the `#` marker before it. Then use that next word. Floored starts can only come from a start byte on a `# ` marker, which is always followed by the heading's first word.
- Known limit: if the previous chapter ends in a one-word paragraph, the floored start looks like a paragraph start and stays as stored.
- First version bug, found by e2e: a correct start on a one-word heading (`# 2`) followed by another heading (`# TITLE 2`) was moved forward. The 'not its own paragraph's first word' condition fixes it, with a unit test.
- The repair applies once the word index has loaded (cached forever under bookKeys.wordIndex; the reader loads it anyway). Before that, a consumer sees the stored starts.

Consumers checked:
- reader (TOC/contents list, chapter progress and labels, read-aloud segments, page mode and RSVP jumps via jumpToWord): all read the one useBookChapters result.
- book detail (chapter list and jump): useBookChapters, called above the early returns.
- buddy-read and buddy-read-discussion (chapter markers, chapter labels, chapter-anchored comments): useBookChapters.
- reading goals and sessions: don't read chapters; their positions come from saves.
- RSVP in-app: has no chapter navigation of its own; a TOC jump from RSVP lands in the standard view, browsing.
- BLE upload: see the out-of-scope note above (parseChapters reads startByte, so uploads get no chapters).

Tests:
- core word-index (wordAtOrAfter);
- utils/chapters.test.ts: 5 repair cases, including the one-word-heading case;
- e2e position-toc-heading-landing (8): red 8/8 before, green after;
- jump-settle-guard: now exact. Chapter 2 of the stray-anchor book opens with its number heading `2`, so the exact start is that heading's word (51), not TITLE 2;
- new e2e chapter-jump-first-word (3): book detail, TOC jump from RSVP, TOC jump in page mode;
- scroll-mode-appearance-anchor chapter-break test: its offset lookup now also finds a heading (page object), and its doc is updated.

Legacy red checks (the importer temporarily switched back to wordOf, via sed, restored from a copy):
(a) floored import, repair on: the 206.3 specs 13/13 green. This proves the read-time repair end to end.
(b) floored import, repair off: 12/13 red (the appearance test doesn't depend on the chapter start).

Real Chrome (claude-in-chrome, which paints at 1fps, rAF gaps of about 1000ms), fresh Morning Star import:
- TOC jump to 'Chapter 12: The Julii': heading at +2px, the previous chapter's text above the edge. Read from here saved 28580, the heading's first word, as the only save; the heading stayed at +2.
- 'Chapter 33: Gods and Men': the same (86350, +2).
- Back and reopen: the heading at +2, no extra save.
- Legacy data could not be checked in Chrome (the library at :3001 was empty); covered by red check (a).

Not done: the note about a wheel during a 1fps landing (let real input cancel the jump's fine align). It is pre-existing and was a 'consider'; left for a decision, see the report.

Also in this batch, the TASK-206.2/208 follow-ups:
- book-merge-apply builds its update via buildBookMergeUpdate, moved with serverMetadataStamp into sync/book-merge.ts and re-exported from sync/index so the node-env SQLite test can import it. New cases: equal stamps keep the local position; a later add date isn't applied; an unrouted field throws.
- applyBookMerge names every column and throws on leftovers.
- position-reopen and position-late-resize use reader.leaveFlushed.
- E2E_WORKERS takes a '%' share only if it matches /^[1-9]\d*%$/.

Results:
- tsc (app + e2e) clean; biome clean (only the pre-existing warnings);
- vitest: app 1343/1343, core 194/194;
- full default e2e run: 190/190 (5.5 min).

2026-10-26 review fixes (3 reviewers; lese-worker), part 1.

HIGH, buddy-read chapter anchors:
- useBookChapters returns { chapters: ShownChapter[], isResolved }. ShownChapter = Chapter + storedStartWord, the start as stored, which the server's copy knows the chapter by.
- The 'About the chapter' options post the stored start (pages/social/discussion-chapters.ts chapterAnchorOptions).
- Items are filed by discussionChapterIndex: a chapter comment matches on its stored start, its shown start, or the start one word on; a positioned item goes by position. Old chapter comments no longer group under the previous chapter.
- Unit tests: discussion-chapters.test.ts (4).
- No web integration test: the server is unchanged and its contract is pinned by 'anchors must lie in the book, and chapter anchors on a chapter start'; that suite needs a DATABASE_URL, which I won't point at the Coolify URL.

MEDIUM 1: a start on a one-word non-heading paragraph moves when the next word opens a marker-only heading carrying the chapter's title (letters and digits, either containing the other), unless the next chapter already starts there. Backstop: buildChapterHeadingMap skips the fallback title when the next paragraph is a heading at startWord + 1 (unit test).

MEDIUM 2: a dedupe pass moves a chapter that isn't after the previous one onto previous + 1 when that word opens a marker-only heading and the following chapter isn't there or earlier. Tests: a floored part and its chapter end up on 'I' and 'Chapter'; a new import's are left alone.

MEDIUM 3: findPageForWord and readFirstVisibleWord (page-view/measurements.ts) consider [data-heading-word]. E2E (chapter-jump-first-word): the chapter novel with endFigure (a tall figure ends each chapter, taking the previous chapter's last text off the heading's page). TOC jump, commit and reopen land on the heading's page. Red with spans-only measurements.

MEDIUM 4: BookChapters takes isResolved and disables jumps until the word index has fetched. useBookWordIndex has an { enabled } option; useBookChapters loads it only when the book has chapters.

MEDIUM 5: buildBookMergeUpdate returns the exact BookMergeUpdate (sync/book-merge.ts); applyBookMerge's `Record<string, never>` rest check makes an unrouted column a type error. At runtime a leftover key throws in DEV (tested); in production it is skipped and returned, and pullSync reports book_merge_unrouted.

2026-10-26 review fixes, part 2 (lese-worker).

LOW:
6. topVisibleWord includes [data-heading-word]: a heading resting at the top saves its own word. E2E in position-toc-heading-landing; red without it (2493 instead of 2490).
7. v2-roundtrip.test.ts: a heading's paragraph start and chapter index equal its first word; red with wordOf.
8. core WordIndex.firstShownWord(byte) (clamped, one comment) replaces the four Math.min(wordAtOrAfter...) copies; wordAtOrAfter's doc is trimmed; the 'no word spans' why stays only on data-heading-word in paragraph.tsx; the scroll-view comments are cleaned.
9. chapters.test.ts: `## ` and two-floored-in-a-row cases (10 repair cases); the docblock is the rule plus the why, with no task ID.
10. book-merge.test.ts imports from ../book-merge; the sync/index re-export is gone (this corrects the earlier note).
11. The spec doc names the three paths; playwright.config throws on an invalid E2E_WORKERS.

Accepted and noted, not fixed:
- old chapters that can't be repaired (heading characters the tokenizer drops, wordless opening paragraphs);
- the brief pre-refetch mismatch (book detail disables jumps meanwhile);
- positions saved one word early self-heal on the next scroll.

Legacy check redone (importer back on wordOf): repair on 15/15 green; repair off 13/15 red.

Results:
- tsc (app + e2e), biome clean;
- vitest: app 1354, core 195;
- full e2e run 204/204 (includes 206.4's 12 tests).

Real Chrome (1fps), Morning Star:
- scroll, Chapter 20: heading at +1px; saved 48434 (the heading) as the only save; reopen +1px.
- page mode, Chapter 33: the heading is on the landed page; saved 86350; reopen shows its page, no extra save.
- Observation, layout not position: Chromium left that heading at the bottom of its column despite break-after: avoid. The profile is set back to scroll.

2026-10-26 round 2 fixes (verifier + red team; lese-worker).
1. The one-word-paragraph + title rule is dropped (false positive on pre-injectTocHeading imports such as 'I' then '## The Boy'). Only the floored rule remains (the stored word doesn't open its own paragraph). The buildChapterHeadingMap backstop stays. Tests: the floored 'Fin.' case now stays (documented); 'I'/'## The Boy' and 'ONE'/'# The Boy Who Lived' must not move.
2. Dedupe uses strict `<`. Tests: the '# I | # II | # III' and '# 5 | # 6 | # 7' chains (stored early) spread onto their own headings; red with `<=`.
3. discussionChapterIndex: three passes in priority order (stored start, shown start, start + 1). Test: part and chapter (stored 0/1/2, shown 0/2/3); a comment at 2 belongs to Chapter 1.
4. useBookChapters isResolved = isFetched && !isError while unrepaired, so an index error keeps book-detail jumps off.
5. scroll-view wordOffsetFromTop also finds [data-heading-word].
6. The BookMergeUpdate type moved above buildBookMergeUpdate's docblock; findPageForWord's doc says 'word span or heading'.
Accepted and noted: tokenizer-dropped leading characters, wordless sections, and the part-after-a-one-word-paragraph false negative (one word early).

Checks: tsc (app + e2e), biome, vitest app 1363 / core 195 green. The full e2e run + @lowfps was started but stopped by Claude Code for low system memory (not a test failure); not rerun yet.

2026-10-26 lese-planner: accepted after 2 review rounds (3 reviewers, then verifier + repair red team) and a final verification (READY AFTER NITS: two comment/naming nits handed to lese-worker). Full e2e 206/206, @lowfps 4/4, vitest/tsc/biome green; real Chrome scroll + page mode on Morning Star. The title-match repair rule was dropped after review (false positives on pre-cd17a12 imports); accepted false negatives are documented above.
<!-- SECTION:NOTES:END -->
