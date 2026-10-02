---
id: TASK-176.17
title: Personalized and social shelves on Explore
status: Done
assignee:
  - '@claude'
created_date: '2026-10-01 10:05'
updated_date: '2026-10-01 11:45'
labels:
  - explore
  - social
milestone: m-6
dependencies:
  - TASK-176.1
  - TASK-176.2
  - TASK-176.8
references:
  - apps/capacitor/src/pages/explore/landing.tsx
  - apps/capacitor/src/components/social/activity-feed.tsx
  - TASK-171
documentation:
  - EXPLORE-SCOPE.md
modified_files:
  - apps/capacitor/src/pages/explore/personal-picks.ts
  - apps/capacitor/src/pages/explore/personal-shelves.tsx
  - apps/capacitor/src/pages/explore/landing.tsx
  - apps/capacitor/src/pages/explore/index.tsx
  - apps/capacitor/src/pages/explore/__tests__/personal-picks.test.ts
  - apps/capacitor/src/pages/explore/__tests__/personal-shelves.test.tsx
parent_task_id: TASK-176
priority: medium
ordinal: 112000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Why: nothing on the Explore landing knows who the reader is. The library knows which books and authors they read, and social features (TASK-171: friends, activity feed, buddy reads) know what friends are reading, but Explore shows the same shelves to everyone.

Depends on TASK-176.1 (tags) and TASK-176.2 (author filter) for matching, and TASK-176.8 for the restructured landing these shelves slot into.

Outcome: returning readers see shelves derived from their own reading and their friends'.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 'Because you read X' shelf recommends catalog books sharing tags/genre with a recently read library book
- [x] #2 'More by authors you read' shelf shows unread catalog books by authors in the library
- [x] #3 'Friends are reading' shelf shows catalog books from friends' activity, respecting their visibility settings
- [x] #4 Books already in the library are excluded from these shelves
- [x] #5 Shelves are hidden for users with no library or no friends rather than shown empty
- [x] #6 Personalization works for no-account users from local library data; social shelf only for signed-in users
- [x] #7 Tests cover each shelf's selection rules and the empty/no-account cases
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Client-side selection (personal-picks.ts, pure) feeding PersonalShelves in the landing's personal slot under the hero. Library data from queryHooks.useBooks / useLibraryCatalogIds (local SQLite, so it works without an account). Because you read: most recently read catalog book -> /books/similar. More by authors you read: up to 3 recent distinct library authors -> /search?author= each (byAuthor key). Friends are reading: useFeed only when signed in; non-own events with a catalogId. All shelves drop owned books and hide when empty.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Visibility: the friends shelf reads only the existing feed endpoint, which the server already filters at read time by the friend's profile visibility, feedEnabled and per-section visibility (apps/web lib/social/feed.ts). The client never widens that.

No new endpoints and no capacitor schema/query changes.

Known limit: 'Because you read' needs a catalog-imported book; a library of only local imports gets the author shelf but not this one.

Tests: personal-picks.test.ts (seed choice, author pick/dedupe, owned exclusion, friends selection incl. own/non-catalog), personal-shelves.test.tsx (library shelves, no-account never fetches the feed, signed-in friends shelf, empty library shows nothing and fires no requests).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Explore's landing now has 'Because you read X', 'More by authors you read' and, when signed in, 'Friends are reading' shelves. They come from the local library (so they work without an account) and the visibility-filtered activity feed, exclude books already in the library, and hide themselves when empty.
<!-- SECTION:FINAL_SUMMARY:END -->
