---
id: TASK-187
title: Tell the user when cloud storage is full
status: To Do
assignee: []
created_date: '2026-10-02 17:23'
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
- [ ] #1 When content is refused for quota, the sync result tells the user which books are not backed up and why
- [ ] #2 Settings (cloud sync) shows used and total cloud storage from contentQuota
- [ ] #3 A book whose content was refused is marked as not backed up on its detail page
- [ ] #4 A blocked book is retried only when the free space reported by the server covers that book's size
- [ ] #5 Production per-user usage is checked before TASK-123 ships and the quota env is set if needed
<!-- AC:END -->
