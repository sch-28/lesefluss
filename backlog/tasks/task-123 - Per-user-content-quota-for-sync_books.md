---
id: TASK-123
title: Per-user content quota for sync_books
status: Done
assignee: []
created_date: '2026-05-01 15:39'
updated_date: '2026-10-02 17:26'
labels: []
dependencies: []
modified_files:
  - apps/web/src/lib/content-quota.ts
  - apps/web/src/lib/content-quota.test.ts
  - apps/web/src/lib/content-quota.integration.test.ts
  - apps/web/src/lib/article-import.ts
  - apps/web/src/lib/article-import.test.ts
  - apps/web/src/lib/social/copy-book.ts
  - apps/web/src/lib/social/errors.ts
  - apps/web/src/routes/api/sync.ts
  - packages/core/src/sync.ts
  - packages/core/src/social.ts
  - apps/capacitor/src/services/sync/index.ts
  - apps/capacitor/src/services/sync/session.ts
  - apps/capacitor/src/services/sync/content-quota.ts
  - apps/capacitor/src/services/sync/__tests__/content-quota.test.ts
  - agents/web.md
ordinal: 2100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today neither `POST /api/sync` nor the new `POST /api/import/article` enforce a per-user storage cap on `sync_books.content`. With the browser extension landing (TASK-86), authenticated users can submit rendered HTML of up to 5MB per request at 20 req/min, persisting indefinitely. Rate limiting alone doesn't bound total storage.

Scope:
- Decide a per-user cap (suggested: total `SUM(file_size)` across non-deleted `sync_books` rows for the user, e.g. 500MB).
- Enforce on both write paths: sync push (existing) and `/api/import/article` (new).
- Return 413 with a clear error when the cap would be exceeded.
- Optional: surface remaining quota in the sync pull response so clients can warn users proactively.

Out of scope: paid tiers / quota uplift. This is just a sane default cap.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A documented per-user cap on total stored content size for non-deleted sync_books
- [x] #2 Cap enforced on `POST /api/sync` book upserts (returns 413 on exceed)
- [x] #3 Cap enforced on `POST /api/import/article` (returns 413 on exceed)
- [x] #4 Tests cover the at-cap and over-cap cases for both endpoints
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cap: 500 MB per account (DEFAULT_CONTENT_QUOTA_BYTES, env SYNC_CONTENT_QUOTA_BYTES) in apps/web/src/lib/content-quota.ts. Measure: server-side octet_length(content)+cover_image+chapters+link_ranges over non-deleted sync_books. file_size NOT used: it is client-supplied (SyncBookSchema.fileSize) and spoofable. octet_length on TOASTed text reads the stored raw size without detoasting, so the SUM is cheap.

Sync push: fitPushToContentQuota runs in the push transaction under a per-user pg_advisory_xact_lock (also taken by article import + share copies -> no concurrent overshoot). Plan = deltas vs stored row (replacing content counts only the difference; absent fields keep stored value; tombstones in the same push free space first; chapter rows/tombstoned rows count 0); growing books admitted in payload order while <= cap (at-cap allowed). Over-quota books are upserted WITHOUT content/cover/chapters so position/metadata/highlights still sync; other devices' pull skips standalone books without content (no phantom). Everything else commits; response is 413 {code:'content_quota_exceeded', rejectedContentBookIds, usedBytes, quotaBytes}. Old clients treat the 413 as a failed push (re-upload content each push, error log) but their progress is still committed server-side, so no data wedge. GET /api/sync now returns contentQuota {usedBytes, quotaBytes}.

Article import: insertSyncBook wraps insert in a tx with reserveContentQuota -> 413 with same body shape (extension shows the `error` string).

Shares (ADR-0004 / TASK-171.7): a copy counts against the recipient. copyBookForUser reserves the recipient's quota and throws SocialError('quota_exceeded') (413) into a full account, so accept/join rolls back and the share stays pending. Message added in core socialActionErrorMessage. Linking to an existing copy (created:false) needs no room.

Client (apps/capacitor/src/services/sync only): postPush treats a quota 413 as success for everything but the listed content: watermarks/LAST_SYNCED advance, rejected ids are NOT added to server-content cache and are persisted in content-quota.ts (sync_content_quota_block, with freeBytes at refusal). Later pushes skip their content (metadata/position still pushed). A pull whose contentQuota shows more free room than at refusal clears the block so the content is retried once. Cleared on account switch/sign-out. getQuotaBlock() is exported for a future UI warning (no UI added here; follow-up: show 'cloud storage full' on book detail / settings).

Tests: web content-quota.test.ts (planner at/over cap, utf8, deltas, delete nets out, env), article-import.test.ts (413 path), content-quota.integration.test.ts (sync POST at-cap 204 / over-cap 413 with position still committed, no double count, tombstone frees, GET contentQuota, article import at-cap 200 / over-cap 413, share copy refused into full account). Capacitor sync/__tests__/content-quota.test.ts (push completes on 413, content not re-offered, retried after room grows, other 413s still fail). Integration run against a throwaway DB (created + migrated + dropped).

Noted, not changed: pushed linkRanges are never stored by the sync upsert (bookInsertValues omits them) - pre-existing. Buddy-read flows that copy to several users in one tx take several advisory locks; PG deadlock detection would abort one in the unlikely crossing case.

Review fixes: (1) quota integration test stubs ORIGIN_KEY_SECRET so GET passes without BETTER_AUTH_SECRET. (2) Added route-level integration cases: stored book re-pushed with larger content/cover/chapters over quota -> 413, stored blobs unchanged, new title/position applied; two parallel pushes that together exceed the cap -> exactly one 204 + one 413, usage 800 <= 1000 (verified the test fails [204,204] with the lock removed). (3) POST /api/sync now takes lockContentQuota first in the transaction (before takedown / copy-origin / duplicate-origin checks); fitPushToContentQuota no longer locks itself and documents that the caller must hold the lock. copyBookForUser takes the recipient's lock before liveCopyOf + insert, so share-accept and push serialise and the duplicate-origin check always sees the other side's row (closes the pre-existing unique-violation race). UI warning + per-book unblock are deferred to a follow-up task.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Per-user cap on stored cloud content: 500 MB by default (`SYNC_CONTENT_QUOTA_BYTES` overrides), measured server-side as octet_length of content + cover + chapters + link ranges over non-deleted sync_books (client-sent file_size is not trusted). A per-user advisory lock taken first in the push transaction, in article import and in share/buddy-read copies serialises writers.

- Sync push: books that do not fit keep their position, metadata and highlights, but their new content is refused; stored blobs are never overwritten (COALESCE). The rest of the push commits and the response is 413 `content_quota_exceeded` with `rejectedContentBookIds`. GET /api/sync returns `contentQuota`.
- Article import: 413 when full, no row written.
- Share copies count against the recipient; a copy into a full account is refused and the share stays pending ("Your cloud library is full").
- App: a quota 413 counts as a successful push except for the refused content, which is skipped on later pushes and retried once the server reports more free room; cleared on sign-out/account switch. Older builds see a failed push but lose no progress.

Verified: unit + route-level integration tests on a throwaway DB (at/over cap for both endpoints, larger re-push over quota keeps stored blobs, parallel pushes admit exactly one), web 250/250 with DB, capacitor sync 58/58, independent review found no data-loss bugs. Follow-up TASK-187: tell the user when storage is full, per-book unblock, and check production usage before deploying.
<!-- SECTION:FINAL_SUMMARY:END -->
