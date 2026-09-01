---
id: TASK-170.5
title: Point the reader's dictionary drawer at our own backend
status: Done
assignee: []
created_date: '2026-08-28 20:46'
updated_date: '2026-09-01 21:17'
labels:
  - reader
  - dictionary
  - client
dependencies:
  - TASK-170.3
  - TASK-170.4
documentation:
  - /home/jan/.claude/plans/adaptive-inventing-sparrow.md
parent_task_id: TASK-170
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Switch the reader from the dead third-party dictionary API to our own endpoint. This is the only user-visible step of the feature and should land only once dictionary data has actually been imported, since everything before it is inert backend work.

Today `apps/capacitor/src/pages/reader/dictionary-modal.tsx` calls `https://api.dictionaryapi.dev` with a bare fetch and no client abstraction. Replace that with a small service module and query-key module mirroring the existing catalog client conventions in `apps/capacitor/src/services/catalog/`, so the dictionary request is built and cached the same way every other backend call in the app is.

The drawer must pass the book's language so the backend can try it first. The book object is already in scope at the single call site in `apps/capacitor/src/pages/reader/index.tsx` and is guaranteed non-null there, so no new plumbing is needed. The language must also become part of the react-query cache key: it is currently keyed on the word alone, which would serve a German result for an English book after switching between them.

Two rendering details need care. The component currently uses part-of-speech as a React list key and definition text as the nested list key. Our responses can legitimately contain several entries sharing a part of speech, and repeated gloss text is possible, so both keys will collide — switch to index-based keys. The component also dereferences the meanings array unguarded, which needs a guard for a response shape it no longer fully controls.

Drop the phonetic display: the old API returned pronunciation and ours does not, so the field goes rather than rendering an empty line.

Two new states are worth showing. When a lookup resolved through an inflection, show the relationship before the definition, for example that "Sprüche" is the plural of "Spruch", followed by Spruch's own definition. When the answering language differs from the book's language, say so quietly — a fallback that silently returns an English definition inside a German book is exactly the failure mode this feature is meant to avoid, and making it visible is cheap.

Wiktionary attribution must appear in the drawer. This is a licensing requirement for redistributing CC BY-SA content, not a design preference, and the endpoint returns the attribution text for this purpose.

Finally, remove the now-unused third-party dictionary origin from the web CSP in `apps/web/vite.config.ts`. The catalog origin is already allow-listed for connections, so the new endpoint needs nothing added — only the old constant and its injection into the app CSP removed.

Design reference: /home/jan/.claude/plans/adaptive-inventing-sparrow.md section 4.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Tapping a word in the reader fetches from our own backend; no request to any third-party dictionary host is made from the app
- [x] #2 The book's language is sent with the lookup and is part of the query cache key, so switching between books of different languages does not serve a stale cross-language result
- [x] #3 An inflected word shows the lemma relationship followed by the lemma's definition
- [x] #4 When the answering language differs from the book's language, the drawer indicates which language answered
- [x] #5 Wiktionary CC BY-SA attribution is visible in the drawer
- [x] #6 A word with no definition shows the existing not-found message rather than an error state
- [x] #7 A genuine network or server failure still shows the error state, distinct from the not-found message
- [x] #8 No React duplicate-key warnings appear when a response contains several entries sharing a part of speech
- [x] #9 The dictionary request goes through a service module and query-key module following the existing catalog client conventions
- [ ] #10 The third-party dictionary origin is removed from the web CSP and the app still loads and looks words up on the web build
- [x] #11 pnpm check-types passes in apps/capacitor
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The reader now looks words up against our own catalog. No request leaves for any third-party dictionary host.

**New** `apps/capacitor/src/services/dictionary/` — `client.ts` (`lookupWord`, reusing `CATALOG_URL` rather than introducing another env var) and `query-keys.ts` (`dictionaryKeys.lookup(word, lang)`), both following the existing catalog service conventions. Shared response types added to `packages/core/src/dictionary.ts`, closing TASK-170.3's deferred criterion.

**Drawer rewrite** — takes a `lang` prop, passed `book.language` from the single call site. The language is part of the query key: it was keyed on the word alone, so opening the same word in a German book after an English one would have been served the English definition from cache.

Both React list keys were content-derived (`partOfSpeech`, then the definition text). Neither is unique against the new data — entries routinely share a part of speech and glosses repeat — so both moved to index keys, with a `biome-ignore` explaining why, since the list is immutable per query result and never reordered.

Two new states: an inflection line showing `Sprüche → Spruch` with the grammatical note, and a language chip when the answering language differs from the book's, so a fallback is visible rather than silently wrong. `phonetic` was dropped — the old API had pronunciation and ours does not, so the field goes rather than rendering an empty line. Wiktionary CC BY-SA attribution renders under every entry and opens the license via `@capacitor/browser`.

**CSP** — `DICTIONARY_URL` and its `connect-src` entry deleted from `apps/web/vite.config.ts`. The catalog origin was already allow-listed, so nothing was added. `grep` confirms no reference to the old API remains anywhere in source.

**Also corrected:** `apps/web/src/routes/privacy/index.tsx` told users that lookups "query a public dictionary API directly from your device". That became false with this change, so it now says lookups go to our own service and names what is sent. This was not in the task's acceptance criteria but shipping the change without it would have left the privacy page inaccurate.

Full-repo `pnpm check-types` passes; all 650 capacitor tests pass; biome clean.

**Not verified:** acceptance criterion 10, the end-to-end web-build check. That needs the dictionary data loaded into the real catalog Postgres, which has not happened yet — the endpoint currently answers every lookup with `entry: null` against an empty table. Everything up to that point is verified against a local database holding the real 2.6M-row German import.

**Update after the drawer was actually rendered.**

The original summary noted the drawer had never been displayed. It has now been run against a local catalog holding the real imported data, in a web dev build, with screenshots:

- Part-of-speech grouping and the 3-sense cap render correctly, one heading each.
- The lemma line renders in all three reader themes (`anchors` → `anchor`, with the inflection note above the definition).
- Attribution renders under every entry and its tap opens the CC BY-SA licence.
- Not-found and error states are distinct and correct — the error state was checked with the catalog server genuinely stopped, not mocked.

**One cosmetic finding, left as-is:** in the sepia theme `bg-muted` resolves to exactly the drawer surface colour, so the language chip's pill is invisible and it reads as loose floating text. The text itself is legible (7.6:1) and light and dark are fine (15.7:1 and 12.7:1). It is a theme-token collision rather than a defect in this work, so it is recorded here rather than patched.

Since then the grouping was changed to group by part of speech in first-seen order rather than only consecutively — the server orders by rank then entry, so a word with two noun entries either side of a verb would have rendered "NOUN" twice. The chip also gained screen-reader text and a higher-contrast token.

**Acceptance criterion 10 remains unticked.** The CSP change was verified by grep and the app was exercised on a dev build, but a production build with the real CSP headers has not been loaded. That is verified by the deploy itself, not before it.
<!-- SECTION:FINAL_SUMMARY:END -->
