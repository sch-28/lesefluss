---
id: TASK-171.17
title: 'Relationships API: each friend''s current book and progress'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-02 21:33'
updated_date: '2026-10-02 21:38'
labels:
  - social
  - api
dependencies: []
modified_files:
  - packages/core/src/social.ts
  - apps/web/src/lib/social/profile-view.ts
  - apps/web/src/lib/social/friends.ts
  - apps/web/src/lib/social/profile-view.integration.test.ts
parent_task_id: TASK-171
priority: high
ordinal: 137000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The redesigned Social tab shows friends as a row of large avatars. Each avatar has a progress ring and a one-line caption for the book that friend is reading now. Today the relationships endpoint returns only name, handle and avatar for each friend, so the app has nothing to draw the ring from.

Add an optional "now reading" field to each friend in the relationships response: the friend's most recent in-progress book, with its title, cover and progress percent. Use the same data and shape the friend's profile already returns in its currently-reading section (`ProfileBook`).

Privacy: the field follows the same rules as that friend's profile. It is present only when the viewer could see the friend's currently-reading section on their profile. That means the friend's `showCurrentlyReading` is on and their profile visibility lets this viewer see it. It is never sent for incoming, outgoing or blocked people.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each entry in `friends` of the relationships response can carry the friend's most recent in-progress book (title, author, cover, progress percent), or nothing
- [x] #2 The book is present only when the viewer could see that friend's currently-reading section on their profile; with showCurrentlyReading off or visibility denying the viewer, it is absent
- [x] #3 Incoming, outgoing and blocked entries never carry reading data
- [x] #4 Shared types in @lesefluss/core describe the new field and the app and website still type-check
- [x] #5 Server tests cover: a visible book, showCurrentlyReading off, visibility denying the viewer, a friend reading nothing, and a friend whose only book is finished
- [x] #6 The relationships endpoint still makes a fixed number of queries no matter how many friends there are
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. core/social.ts: friends entries in SocialRelationships gain `nowReading: ProfileBook | null`.
2. web lib/social/profile-view.ts: split shelvesFor into a batched row query over many owners (inArray userId, content column never selected) and a pure per-owner rollup. currentlyReading is ordered most recently moved first (sync_books.updated_at = position revision; series use their newest chapter). Profile currently-reading shelf gets that order too (was arbitrary DB order).
3. New `nowReadingFor(exec, viewerId, friendIds)`: one query on social_profile (visibility = friends AND show_currently_reading), one batched shelf query for the eligible ids, returns Map<friendId, ProfileBook>. Two extra queries regardless of friend count.
4. friends.ts listRelationships: attach nowReading to visible friends only; incoming/outgoing/blocked untouched.
5. Integration tests in profile-view.integration.test.ts (has the shelf fixtures): visible book, showCurrentlyReading off, visibility private, friend reading nothing, friend with only finished books, recency order, requests never carry it.
6. Typecheck web + capacitor, run web tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Local dev DB `rsvp` lacks the social migrations; integration tests were run against a throwaway database (create, drizzle-kit migrate, vitest, drop). All 160 social tests pass.

Friend requests now require a shared buddy read, so the test inserts the incoming request row directly.

apps/capacitor tsc shows one unrelated pre-existing error at src/pages/reader/index.tsx:1913 (string | null to RsvpView prop); web and core type-check clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Friends in the relationships response now carry `nowReading: ProfileBook | null`, their most recently read in-progress book.

- core: `SocialRelationships.friends[]` gains `nowReading`.
- web profile-view.ts: the shelf query is split into a batched row loader (many owners, no content column) and a pure per-owner rollup. Currently reading is ordered most recently moved first (`sync_books.updated_at`, newest chapter for serials); the profile shelf uses that order too.
- New `nowReadingFor`: one social_profile query (visibility friends and showCurrentlyReading on) plus one batched shelf query, so `listRelationships` adds two queries regardless of friend count. Only visible friends are passed; requests and blocks never get reading data.
- Tests: visible book picks the newest, showCurrentlyReading off, private profile, no books, only finished, requests carry nothing, profile shelf recency order.
<!-- SECTION:FINAL_SUMMARY:END -->
