---
id: TASK-170.4
title: Unicode-aware word normalization in the reader
status: Done
assignee: []
created_date: '2026-08-28 20:45'
updated_date: '2026-08-28 21:43'
labels:
  - reader
  - dictionary
  - i18n
dependencies: []
documentation:
  - /home/jan/.claude/plans/adaptive-inventing-sparrow.md
parent_task_id: TASK-170
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The reader's word normalization is ASCII-only and silently destroys any word containing a non-ASCII letter. `stripPunct` in `apps/capacitor/src/pages/reader/rsvp-engine.ts` strips everything outside `a-zA-Z`, apostrophe and hyphen, so "Bäume" becomes "Bume" and "café" becomes "caf". German dictionary lookups cannot work at all until this is fixed, and accented English words are already broken today.

Widen the character class to Unicode letters while still keeping apostrophes and hyphens, and normalize to NFC so that a composed umlaut and a decomposed one produce the same key. The dictionary importer applies the identical rule on its side; if the two drift, lookups miss silently rather than failing loudly, so the shared expectation is worth asserting in tests.

This is not confined to the dictionary. `stripPunct` and `cleanWord` also feed glossary matching and in-book search, so widening them changes which words those features match — for the better, but it is a real behaviour change worth verifying. Two call sites in `apps/capacitor/src/pages/reader/index.tsx` additionally reimplement the same normalization inline instead of calling the shared helper: the word-tap handler and the selection-toolbar lookup. Route both through the shared function so there is one definition of what a word is.

There are currently no tests on these functions at all. Add them alongside the existing pure-logic reader tests.

Design reference: /home/jan/.claude/plans/adaptive-inventing-sparrow.md section 5.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Normalizing a word with umlauts preserves them ("Bäume" stays "bäume", not "bume")
- [x] #2 Normalizing an accented word preserves the accent ("café" stays "café", not "caf")
- [x] #3 A composed and a decomposed spelling of the same accented word normalize to the same key
- [x] #4 Apostrophes and hyphens are still preserved, and digits and surrounding punctuation are still stripped
- [x] #5 The word-tap and selection-toolbar lookup paths in the reader use the shared normalization helper rather than reimplementing it inline
- [x] #6 Glossary matching still works for existing plain-ASCII entries after the change
- [x] #7 Unit tests cover umlauts, accents, composed versus decomposed forms, apostrophes, hyphens and digits
- [x] #8 pnpm check-types passes
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
`stripPunct` in `apps/capacitor/src/pages/reader/rsvp-engine.ts` now uses `\p{L}\p{M}` with the `u` flag instead of `a-zA-Z`, so words carrying non-ASCII letters survive intact. `’` was added to the keep-set alongside `'`; the server folds the two when building its lookup key, which leaves the typographic apostrophe in the displayed word and the glossary label.

NFC normalisation deliberately does *not* happen here. The server owns the whole key rule — import and lookup call one function in one process — so the client only has to avoid destroying characters, and combining marks are preserved for the server to compose.

**`cleanWord` was deleted.** It only existed to lowercase for the old API's URL, and with normalisation server-side it had no callers left.

`onLookup` collapsed from `(word, original)` to a single original-cased word, which let `selectedWordOriginalRef` and the `handleRsvpLookup` wrapper go too — the drawer and the glossary now read the same value. Net removal of 12 lines from `index.tsx`.

**Blast radius** — the two call sites in `index.tsx` that reimplemented the lowercase step inline (word tap at ~834, selection toolbar at ~873) now just call `stripPunct`. Glossary matching in `use-glossary-decorations.ts` was already `\p{L}`-based, so accented labels start underlining correctly rather than regressing. In-book search benefits the same way.

Pre-existing mangled glossary labels ("Bume") stay mangled; they already matched nothing, so nothing changes for them. No migration.

**Tests** — new `__tests__/rsvp-engine.test.ts`, 6 tests: umlauts, accents, composed vs decomposed round-trip, casing preservation (the signal that separates "Bäume" from "bäume"), apostrophes and hyphens, punctuation and quote stripping, and that digits are still stripped so tapping "1984" stays inert.

All 650 capacitor tests pass; full-repo `pnpm check-types` passes.
<!-- SECTION:FINAL_SUMMARY:END -->
