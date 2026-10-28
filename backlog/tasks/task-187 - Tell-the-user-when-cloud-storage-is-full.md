---
id: TASK-187
title: Tell the user when cloud storage is full
status: Done
assignee:
  - '@claude'
created_date: '2026-10-26 03:15'
updated_date: '2026-10-28 22:32'
labels:
  - sync
  - ux
milestone: m-13
dependencies:
  - TASK-123
priority: medium
ordinal: 133000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up from the TASK-123 review. When a sync push hits the per-user content quota, the server keeps position, metadata and highlights but refuses the book content (413 `content_quota_exceeded`). The app handles this silently: `syncNow` still shows "Synced", and the only signal is a `log.warn`. A user can believe a new book is backed up when it is not, then lose it with the device. The book-detail share blocker says "not_synced", which suggests it will sync later.

`getQuotaBlock()` is already exported from `apps/capacitor/src/services/sync/index.ts`, and `GET /api/sync` returns `contentQuota { usedBytes, quotaBytes }`.

Also from the review (bandwidth): `quotaHasMoreRoom` (`apps/capacitor/src/services/sync/content-quota.ts:66`) clears the whole block on any growth in free space, so a small delete re-uploads every blocked book's full content, mostly to be refused again. Have the server return each refused book's byte delta and unblock a book only when free space covers it.

Before deploying TASK-123: check production usage per user (`SUM(octet_length(content) + ...)` grouped by user_id) and set `SYNC_CONTENT_QUOTA_BYTES` if any account is already near or over 500 MB.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 When content is refused for quota, the sync result tells the user which books are not backed up and why
- [x] #2 Settings (cloud sync) shows used and total cloud storage from contentQuota
- [x] #3 A book whose content was refused is marked as not backed up on its detail page
- [x] #4 A blocked book is retried only when the free space reported by the server covers that book's size
- [x] #5 Production per-user usage is checked before TASK-123 ships and the quota env is set if needed
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Server (apps/web/src/lib/content-quota.ts, routes/api/sync.ts, core sync.ts)
1. planContentQuota already computes each growing book's delta; return it: rejected becomes Map<bookId, deltaBytes>. fitPushToContentQuota passes it through.
2. ContentQuotaExceeded gains optional rejectedContentBytes: Record<bookId, number> (bytes the book would add). rejectedContentBookIds stays, unchanged, for old clients.
   - Old client / new server: extra field ignored by isContentQuotaExceeded + recordQuotaRejection; old behaviour (clear whole block on any growth) unchanged.
   - New client / old server: field absent -> those books stored with unknown size (null) and fall back to the old any-growth rule. GET contentQuota absent (pre-123 server) -> no usage row, no block changes.

Client block model (services/sync/content-quota.ts)
3. QuotaBlock -> { books: Record<bookId, number | null>; freeBytes }. getQuotaBlock reads the old persisted { bookIds, freeBytes } shape as null sizes (no data loss on upgrade). recordQuotaRejection merges sizes, keeps max known size per id.
4. reconcileQuotaBlock(quota, liveContentIds): free = quotaBytes - usedBytes. Drop ids the server now holds content for (contentBookIds) or that are no longer live locally. Unblock sized books smallest-first while their delta fits the remaining free space (decrement as we go, so one freed MB does not re-offer ten books). Null-sized books: old rule (free > block.freeBytes). Replaces quotaHasMoreRoom; pure function blockAfterPull(block, quota, ...) for unit tests.
5. Persist last contentQuota from GET (Preferences sync_content_quota) + expose getContentQuota(); syncKeys.contentQuota / syncKeys.quotaBlock query keys, invalidated in invalidateAfterSync.

Sync result + toast (sync/index.ts, contexts/sync-context.tsx)
6. pushSync returns PushOutcome { newlyBlockedBookIds: string[] } (ids not already in the block before this push); fullSync returns { notBackedUp: { id, title }[] newly blocked, quota }. Titles resolved from the push's own book list, no extra query.
7. syncNow: if notBackedUp non-empty -> toast.warning instead of 'Synced': 'Synced, but cloud storage is full. Not backed up: <title>, <title> and N more.' with action 'Details' -> /tabs/settings/sync. Debounced background pushes (scheduleSyncPush) toast the same once per newly blocked book (owner decision A below); already-blocked books never toast again.

Settings usage (routes/tabs/settings/sync.tsx, Account section)
8. 'Cloud storage' row: '<used> of <total> used' (MB/GB, 1 decimal, binary units to match the 500 MiB default) + thin progress bar; amber at >= 90 %, destructive when any book is blocked. Hidden when contentQuota unknown (old server / never pulled).
9. When the block is non-empty: 'Not backed up (N)' list of titles under the row, each linking to book detail, with one line: 'These books stay on this device only. Delete books from your library to free space; they upload on the next sync once they fit.'

Book detail marker (pages/library/book-detail.tsx, share-sheet.tsx, book-buddy-read.tsx)
10. New ShareBlocker 'quota_full', checked after local_only and before not_synced in shareBlockerFor (takes the block ids). Texts: share 'Cloud storage is full, so this book isn't backed up and can't be shared. Free space to upload it.'; buddy read analogous.
11. Amber banner (same style as the 'Too large to sync' one) when logged in and the book is in the block: 'Not backed up. Your cloud storage is full; this book stays on this device only.' Distinct from not_synced ('hasn't reached the cloud yet', will sync on its own).

Tests
- web: planContentQuota/fitPushToContentQuota return per-book deltas (unit + content-quota integration); 413 body carries rejectedContentBytes.
- capacitor: block migration from old shape; recordQuotaRejection merge; blockAfterPull (fits / partly fits smallest-first / null-size fallback / server-has-content prune / deleted-book prune / quota absent); pushSync newly-blocked outcome (no repeat for already-blocked); shareBlockerFor quota_full ordering. Extend content-quota.test.ts.
- e2e: extend/add a spec with a mocked 413 (toast text, settings row, book-detail banner) - written, not run.

AC5: owner-only prod usage check, left blocked.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-26 re-check: getQuotaBlock() is exported from apps/capacitor/src/services/sync/content-quota.ts:32 (index.ts only imports it). 413 handled silently at sync/index.ts:185-193. AC #5 is an owner prod check; left for the owner.

AC #5 BLOCKED: owner-only production per-user usage check (SUM blob bytes by user_id) and SYNC_CONTENT_QUOTA_BYTES decision before TASK-123 ships. Not actionable by an agent.
Open owner decisions (2026-10-28): A) toast also on background pushes (once per newly blocked book) or only on manual Sync now? Plan assumes once-per-book on both. B) settings list titles of not-backed-up books, or only a count? Plan assumes titles.

2026-10-28 plan approved by planner. Decisions are planner defaults, not owner-confirmed: A) toast on both manual and background pushes, once per newly blocked book; B) settings list shows titles. Coding held until TASK-162 review findings land (sync/index.ts overlap).

2026-10-28 implementation:
- Server: planContentQuota/fitPushToContentQuota return rejected as Map<bookId, deltaBytes>; 413 body adds optional rejectedContentBytes (core ContentQuotaExceeded). Old clients ignore it.
- Client block (services/sync/content-quota.ts): QuotaBlock { books: Record<id, bytes|null>, freeBytes }; reads the old { bookIds } shape as unknown sizes. blockAfterPull: drops ids the server holds content for or that are no longer live; unblocks sized books smallest-first within free space; unknown sizes keep the old any-growth rule. Last contentQuota persisted (sync_content_quota, cleared with account state).
- recordQuotaRejection returns newly blocked ids; internal push() returns NotBackedUpBook[] and notifies onBooksNotBackedUp listeners (pushSync stays Promise<void>, used by the reader). fullSync returns { notBackedUp }.
- SyncProvider subscribes: toast.warning 'Cloud storage is full. Not backed up: "A", "B" and N more.' with Details -> /tabs/settings/sync, for manual and background pushes, once per newly blocked book. syncNow skips 'Synced' when that warning fired.
- Settings: CloudStorageSection (components/sync/cloud-storage.tsx): 'X of Y used' (binary units), bar amber >= 90 %, destructive when books blocked; 'Not backed up (N)' list linking to book detail. Hidden while quota unknown.
- Book detail: amber 'Not backed up' banner; ShareBlocker 'quota_full' (after local_only, before checking/not_synced) in share sheet, buddy-read and the buddy-read picker.
- Tests: web planContentQuota deltas + integration 413 bodies; capacitor content-quota (push block, once-per-book reports, room-based unblock, legacy block shape, blockAfterPull cases), cloud-storage text helpers, shareBlockerFor ordering. e2e: e2e/cloud-storage-full.spec.ts (written, not run).
- Compat: old client/new server ignores rejectedContentBytes (old behaviour). New client/old server: sizes unknown -> any-growth rule; contentQuota absent -> section hidden, block untouched.

2026-10-28 review fixes:
- Manual Sync now: fullSync({ reportNotBackedUp: false }) then a warning 'Synced. N books aren't backed up: not enough cloud storage.' whenever the block is non-empty (View storage action, 10 s). Background pushes toast once per book: 'Not enough cloud storage. Not backed up: ...'.
- Once-per-book: persisted reported set (sync_content_quota_reported), separate from the block; cleared per book when its content uploads or it leaves the library / server holds it; whole set cleared with account state. While unknown-size books remain, block.freeBytes keeps max(old, new).
- Not done (optional): subtracting pending uploads from the room. A wrong guess only re-blocks the book, silently now.
- Account switch removes syncKeys queries. cloudStorage invalidated after single/bulk delete and after every push.
- Block read from storage every time (no module cache) for multi-tab web.
- packages/ui Progress passes value to Root (radix aria-valuenow), gains indicatorClassName; section sets aria-valuetext.
- utils/format-bytes.ts (binary, unit chosen after rounding) shared with multi-book-sync; percentage floored.
- Moved: getCloudStorage + listener + messages to services/sync/cloud-storage.ts; useCloudStorage to services/db/hooks/use-cloud-storage.ts.
- Copy updated (blockers point at Settings > Cloud sync; settings asks to delete backed-up books; titles rendered as tappable rows with chevron). Render test for CloudStorageSection states. e2e spec assertions updated.

2026-10-28 planner: 3 reviews (no HIGH), round-1 fixes accepted; cloud-storage-full e2e green after fixes; full run #1 had no 187 failures. AC5 (prod usage check / SYNC_CONTENT_QUOTA_BYTES) remains an OWNER step before TASK-123 ships. Planner defaults A (toast on manual+background, once per book) and B (titles listed) await owner confirmation.

AC5 (owner, 2026-10-28): prod holds 102 MB total for 31 users, so no account is near the cap. Keep the built-in default of 500 MiB (DEFAULT_CONTENT_QUOTA_BYTES in apps/web/src/lib/content-quota.ts); SYNC_CONTENT_QUOTA_BYTES stays unset in prod.

Owner confirmed defaults A and B (2026-10-28).
<!-- SECTION:NOTES:END -->
