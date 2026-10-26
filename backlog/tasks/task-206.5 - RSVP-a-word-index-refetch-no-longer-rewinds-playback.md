---
id: TASK-206.5
title: 'RSVP: a word-index refetch no longer rewinds playback'
status: Done
assignee: []
created_date: '2026-10-26 03:15'
updated_date: '2026-10-26 03:15'
labels:
  - reader
  - bug
  - rsvp
dependencies:
  - TASK-208
modified_files:
  - apps/capacitor/src/pages/reader/rsvp-engine.ts
  - apps/capacitor/src/pages/reader/use-rsvp-engine.ts
  - apps/capacitor/src/pages/reader/rsvp-view.tsx
  - apps/capacitor/src/pages/reader/index.tsx
  - apps/capacitor/src/pages/reader/__tests__/rsvp-engine.test.ts
  - apps/capacitor/src/pages/reader/__tests__/use-rsvp-engine-rebuild.test.tsx
  - apps/capacitor/src/test-hooks/db.ts
  - apps/capacitor/src/main.tsx
  - apps/capacitor/e2e/rsvp-refetch-keeps-word.spec.ts
  - apps/capacitor/e2e/types.d.ts
  - apps/capacitor/e2e-repro/repro-position-bugs.spec.ts
  - apps/capacitor/e2e-repro/test-hooks/db.repro.ts
  - apps/capacitor/e2e-repro/README.md
parent_task_id: TASK-206
priority: high
ordinal: 180400
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Confirmed at normal frame rate (3/3, with a control): while RSVP plays, invalidating ["books"] (sync pull, chapter fetch) or the word-index query refetches a new WordIndex instance. The words effect in use-rsvp-engine.ts is keyed on [content, bookWordIndex] and resets the index to initialWordRef (the entry word) without clearing the timer, so playback jumps back and the next save/pause persists the rewound word (99 after 106 was already saved).

Fix: keep the current word when only the WordIndex object identity changes (key the effect on stable values such as book id + word count, or keep wordIndexRef and only clamp). If the content really changed, map the position rather than resetting it to the entry word. Never persist a rewind that came from a refetch.

Repro: scratchpad repro-v2/apps/capacitor/e2e/repro-position-bugs.spec.ts (bug 3); port it into the repo.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Ported regression spec: invalidating ['books'] and the word-index query during RSVP playback keeps the displayed word advancing, and pause saves a word >= the last saved one (red before, green after); the control stays green
- [x] #2 Real content changes (serial chapter fetch) still show correct text without rewinding to the entry word
- [x] #3 Full capacitor e2e suite, vitest, tsc, biome pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-26 (lese-worker), parked for the 206.3 round 2 / 206.4 review fixes. Tree is consistent: tsc clean, biome clean, reader vitest 236/236.

Cause, confirmed in code: the words effect in use-rsvp-engine.ts ran on [content, bookWordIndex] and always set the index to initialWordRef. A refetch gives a new WordIndex object for the same text (strings compare by value, so content alone wouldn't re-run it).

Fix (in tree):
- New pure carriedWord(previous, next, entryWord) in rsvp-engine.ts:
  - a first load, a new book, or previously empty words: the entry word;
  - the same text: the word on screen (clamped);
  - changed text of the same book: the word on screen, found by its text within ±200 words of its old index, else clamped.
- The engine takes a bookId (RsvpView passes the reader's id; RsvpView isn't keyed, so it stays mounted across a book switch, and on a switch the content is empty until the new book loads).
- The words effect keys on [bookId, content, bookWordIndex], keeps the previous build in builtRef, sets wordsRef synchronously, and doesn't touch the shown word when the same text keeps the same index.
- The scrub effect (initialWord change) reads wordsRef instead of the render-time words: a rebuild in the same commit had already replaced them (seen in the new hook test: a book switch with a new entry word in one render showed the old book's word). The unused `words` dep is removed.

Tests so far:
- rsvp-engine.test.ts carriedWord (4);
- new __tests__/use-rsvp-engine-rebuild.test.tsx (4): a refetched index keeps 'five' at 4; changed text of the same book follows the word to index 5; another book starts at its entry word; the first text load starts at the entry word.
- DEV hook: test-hooks/db.ts exposeQueryInvalidate (__lesefluss_e2e_invalidate), wired in main.tsx; type in e2e/types.d.ts.
- e2e-repro/test-hooks/db.repro.ts now imports buildBookMergeUpdate from services/sync/book-merge (the sync/index re-export is gone).

Todo:
- port bug 3 into e2e (invalidate ['books'], the word-index key, and a control); red/green check;
- AC#2: no serial e2e exists (a provider mock would be needed), so content changes are covered by the hook test;
- full suite.

2026-10-26 memory incident, cause found (lese-worker). The 17.7 GB orphaned vitest fork worker the planner killed came from my first draft of __tests__/use-rsvp-engine-rebuild.test.tsx.
- The draft probe built a new WordIndex on every render, so the engine's words effect set state on every render: an endless render loop inside act(). That blocks the event loop, so vitest's test timeout never fires.
- The Bash tool moved the run to the background at 200 s. I then killed the vitest processes by pid, but the fork worker survived with parent pid 1 and kept growing.
- The probe was fixed minutes later (the index is memoized per content and fetch).
- Now: a full `vitest run --logHeapUsage` peaks at 135 MB per file, and all 150 files finish in about 9 s.
- Guard against a repeat: the probe throws after 200 renders ('Probe re-rendered without end'). With the loop reintroduced, the 4 tests fail fast and no process remains.
- From now on vitest and Playwright runs are foreground under `timeout`, followed by a check for leftover processes.

2026-10-26 resumed (lese-worker).

AC#1: new e2e/rsvp-refetch-keeps-word.spec.ts (3), ported from e2e-repro bug 3:
- big book, a wheel save, enter RSVP, play until a playback save (P);
- invalidate a query through the DEV hook __lesefluss_e2e_invalidate: ['books'], ['books', id, 'word-index'], or ['book-covers'] (the control);
- then the displayed word keeps changing and RSVP is still playing; pause saves a word > P; the DB row holds it after waitPositionQuiet.
- Green 3/3. Red with carriedWord forced to the entry word: the two refetch cases fail (they saved 227, the entry word, after 234); the control passes.
- Bug 3 is removed from e2e-repro/repro-position-bugs.spec.ts (bug 2 stays for 206.7); README updated.

AC#2: no serial e2e exists (it would need a mock chapter provider). Changed text of the same book is covered by use-rsvp-engine-rebuild.test.tsx (the word on screen is followed to its new index, not reset to the entry word) and by carriedWord's unit tests. A book switch and the first text load still start at the entry word.

Checks: tsc (app + e2e), biome (only the pre-existing warnings), vitest 1363/1363. The full e2e run is pending a free :3001 (the planner's verification run).

2026-10-26 full verification (lese-worker): full default e2e run 209/209 (6.3 min, includes rsvp-refetch-keeps-word); @lowfps 4/4 (2.3 min); tsc, biome, vitest 1363 green; no leftover processes. Ready for review.

2026-10-26 review fixes (3 reviewers; lese-worker). Simplified as the review asked; this corrects the earlier notes.

Verified: content can't change while RsvpView is mounted.
- routes/tabs/reader.$id.tsx renders <BookReader key={id}>, so a book switch remounts it. My earlier note said RsvpView stays mounted across a switch; that was wrong.
- index.tsx shows ReaderSkeleton instead of RsvpView while content or the word index is missing, or while a chapter is loading (isShowingSkeleton).
So AC#2 holds by construction, plus the defensive path below.

Engine (use-rsvp-engine.ts):
- Dropped the ±200-word text search, carriedWord, and the bookId prop on the engine and on RsvpView.
- The words effect keys on [content, bookWordIndex]. On a rebuild it compares the WORD lists, not the content string, with isSameWordStream(previous, next, anchor) in rsvp-engine.ts: same length and the same word and byte offset at the anchor. The anchor is displayedWordRef ?? wordIndexRef.
- Same words: returns without touching the shown word, the timer, the chunks or wordIndexRef. An index past the last word after the final word isn't replayed.
- Different words (defensive only): stops the timer and playback, resets the chunks, clamps the shown word into range (never the entry word), and warns once in DEV.
- The first build (no previous words) starts at the entry word.

Tests:
- rsvp-engine.test.ts isSameWordStream (2).
- use-rsvp-engine-rebuild.test.tsx (fake timers, 4): a refetch while playing keeps the index and keeps playing onward; a refetch while paused keeps the paused word; changed words keep the paused word, stopped and not the word after it (red when the anchor is wordIndexRef); the first text load starts at the entry word. Red with the old always-entry-word rebuild: 3 of 4 fail. The probe prop is renamed `refetch`; the render cap stays.
- e2e rsvp-refetch-keeps-word (4):
  - the refetch helper throws if __lesefluss_e2e_invalidate is missing;
  - RsvpView exposes the displayed index as data-word-index;
  - each playback case records the index before and asserts it is >= it after the awaited refetch (timing-independent), then that it moves on, then the pause save (> the playback save) and the DB row;
  - new paused case: a word-index refetch while paused leaves the index and word unchanged, and playing resumes onward.
  - Red with the always-entry-word rebuild: both refetch cases ('not back at an earlier word': 227 < 234) and the paused case fail; the control passes.
  - While writing the paused case I first suspected a resume stall. It was the engine's 120 ms toggle debounce (TOGGLE_DEBOUNCE_MS), so the test waits it out. No bug.

Nits:
- types.d.ts uses E2EInvalidate from test-hooks/db;
- invalidateBooks is removed from e2e-repro's db.repro.ts and the bug-2 repro type;
- the spec header and the helper doc are cut to the one why.
The 206.7 note is appended.

Results:
- tsc (app + e2e), biome (pre-existing warnings only), vitest 1361/1361;
- full default e2e run 210/210 (6.3 min);
- @lowfps 4/4;
- no leftover processes.

2026-10-26 lese-planner: accepted after review (3 reviewers, no high) + verification (DONE). Simplified per review: the text-follow search, carriedWord and bookId were dropped (content can't change while RSVP is mounted: route key + skeleton); isSameWordStream keeps state untouched on a same-words refetch. Full e2e 210/210, @lowfps 4/4, vitest/tsc/biome green.
<!-- SECTION:NOTES:END -->
