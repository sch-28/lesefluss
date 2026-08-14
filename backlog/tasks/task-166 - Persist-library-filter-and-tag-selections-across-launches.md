---
id: TASK-166
title: Persist library filter and tag selections across launches
status: Done
assignee: []
created_date: '2026-08-14 20:13'
updated_date: '2026-08-14 20:14'
labels:
  - capacitor
  - library
  - qol
dependencies: []
priority: low
ordinal: 91000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The library remembered sort order and grid/list view across launches but forgot the status filter and the tag filter, so a reader who narrowed to "Reading" or to a tag found the full library again on the next open.

Sort and view mode already used `usePersistentString`; the filter axes were plain `useState`. This brings them in line.

Search is deliberately excluded: the search bar is a toggle, so a restored query would render an apparently empty library with no visible cause.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The status filter is still applied after a full app restart
- [ ] #2 A tag filter is still applied after a full app restart, as long as the tag is still in use
- [x] #3 A persisted tag that no longer exists in the library is dropped once the books have loaded, rather than leaving the library empty
- [x] #4 A tag filter is not dropped during the loading phase, when no book has yet reported any tag
- [x] #5 Search text is not restored on launch
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
`filterBy` and the tag filter now use `usePersistentString`, matching `sortBy` and `viewMode`. The tag is stored as free text with the empty string standing for "none", since it is not a fixed union like the others.

The non-obvious part was the existing stale-tag cleanup. It drops a tag that is no longer in use so the library cannot be left empty with no way back, and it ran unconditionally - including during the loading phase, when `books` is empty and therefore every tag looks missing. Persisting the tag without guarding that would have wiped a restored filter on every launch before its tag had a chance to exist. Now gated on `!isPending`.

Device-verified on a Pixel 8 Pro: selecting "Reading" narrowed the library to 1 book and wrote `reading`; after a force-stop and relaunch the filter was still applied and the same single book shown. Seeding a tag that no longer exists and relaunching cleared it to empty once the books loaded, with all 9 books visible.

AC 2 (a valid tag surviving a restart) is not device-verified: none of the library's books carry tags, and manufacturing one would have meant editing the user's own data. It rests on the same `!isPending` guard as AC 4, which was verified.

Worth noting for future device checks: `localStorage` writes made through the devtools bridge are not flushed immediately, so a `force-stop` within a second or two of writing loses them. My first attempt at the stale-tag test silently proved nothing for that reason - the seed never reached disk and the value I read back afterwards was simply the pre-existing one. The retest waits before killing the app and reads the seed back first.

tsc clean, 562 capacitor tests pass.
<!-- SECTION:NOTES:END -->
