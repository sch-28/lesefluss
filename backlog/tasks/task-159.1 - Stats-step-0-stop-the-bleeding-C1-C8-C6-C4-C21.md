---
id: TASK-159.1
title: 'Stats step 0: stop the bleeding (C1, C8, C6, C4, C21)'
status: Done
assignee: []
created_date: '2026-07-28 19:38'
updated_date: '2026-07-28 22:10'
labels: []
milestone: m-7
dependencies: []
documentation:
  - STATS-IMPROVEMENTS.md
modified_files:
  - apps/capacitor/src/pages/reader/session-tracker.ts
  - apps/capacitor/src/pages/reader/__tests__/session-tracker.test.ts
  - apps/capacitor/src/pages/reader/__tests__/session-tracker.property.test.ts
  - apps/capacitor/src/services/db/queries/stats.ts
  - apps/capacitor/src/services/stats/aggregate.ts
  - apps/capacitor/src/services/stats/__tests__/aggregate.test.ts
  - apps/capacitor/src/services/sync/index.ts
  - apps/capacitor/src/services/sync/__tests__/push-selection.test.ts
  - packages/core/src/sync.ts
  - packages/core/src/__tests__/sync-schema.test.ts
  - CONTEXT.md
parent_task_id: TASK-159
priority: high
ordinal: 64000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Four defects that actively corrupt stored or displayed data, plus the test scaffolding that should have caught them. Nothing else in TASK-159 should ship first: every other subtask displays numbers these bugs produce.

**C1 — a forward jump credits the whole skipped span as words read.** `apps/capacitor/src/pages/reader/session-tracker.ts:154-166`. The jump guard suppresses `maxPos` on the tick where the jump happens but still assigns `lastPos = pos`. On the next tick `delta` is measured from the new `lastPos`, so it is small, `pos > maxPos` still holds, and `maxPos` snaps across the entire skipped range. Use the TOC to jump to 80%, read ten seconds, and the row claims 80% of the book as words read. The existing test at `__tests__/session-tracker.test.ts:281` finalizes immediately after the jump and never ticks again, which is exactly the case that passes while the bug is live.

**C8 — a `wpmAvg` of 0 wedges the user's sync permanently.** `packages/core/src/sync.ts:169` declares `wpmAvg: z.number().int().positive().nullable()`, but `session-tracker.ts:298-299` can legitimately produce 0 (five words over eleven active minutes rounds to 0; `wasCapped` only guards the high side). Validation is server-side, so the POST 400s. Uncommitted staged work adds a push watermark that only advances after the server accepts, so the watermark never moves and the same row is re-sent forever. That staged work also clips over-cap batches to the OLDEST rows, guaranteeing an old poisoned row stays in every future batch. Coordinate with whoever owns that change; this is cheapest to fix while it is still in flight.

**C6 — sub-minute sessions are discarded before aggregation.** `apps/capacitor/src/services/db/queries/stats.ts:96-97` skips any row under a minute before summing per day, so five 50-second sittings register as a blank day and reset the streak. The filter belongs after the per-day sum.

**C4 — the WPM chart reads zero for every week before a DST transition.** `stats.ts:218-222` builds bucket keys with `weekStartLocal` (snapped to local midnight) while `:271-279` looks them up on a fixed-millisecond grid. After a DST change the grids differ by an hour, every lookup misses, and `avgWpm` renders 0.

**C21 — no tests exist for any of this.** There are zero tests for `stats.ts` and zero for `date-utils.ts`.

Reasoning, alternatives and related items: `STATS-IMPROVEMENTS.md` section 0.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A test reproduces C1 by ticking at least twice after a jump, fails on current main, and passes after the fix
- [x] #2 Words read after a TOC jump reflects only text actually read past the jump target
- [x] #3 A session row with a computed 0 wpm round-trips through push and pull without rejection
- [x] #4 One malformed session row cannot block the sync queue: the payload is validated or repaired client-side before push
- [x] #5 A day containing only sub-minute sessions counts toward the streak and heatmap when the summed time crosses the threshold
- [x] #6 The weekly WPM series returns non-zero buckets for weeks preceding a DST transition
- [x] #7 Table tests cover the date maths in stats.ts and date-utils.ts, executed under a negative-UTC-offset timezone and across a DST boundary
- [x] #8 Re-reading a range after jumping back over it is credited once, not twice
- [x] #9 Deleting any single piece of the new word-accounting state turns a test red
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
C1 done. Root cause confirmed by a red test: jumping 5000 words then reading 20 credited 5020. The jump guard suppressed `maxPos` on the jump tick but still advanced `lastPos`, so the next ordinary tick saw a small delta with `pos > maxPos` and snapped the high-water mark across the skipped span.

Fix replaces the single `maxPos` high-water mark with segments: `creditedWords` + `segStart` + `segMax`. A jump closes the current segment (crediting only what was read up to it) and rebases at the destination. Re-read protection is preserved *within* a segment, which is what `maxPos` was there for. Two regression tests added; all 17 pre-existing tracker tests still pass.

Note a deliberate behaviour change: a large *backward* jump also rebases, so jumping back to re-read a passage now counts that re-reading. Previously it counted nothing until the reader passed the old high-water mark. The new behaviour seems more honest (the user is genuinely reading) but it is a change, not a pure fix.

Reviewed via /rcktbs-review with two fresh-context reviewers. It found a regression in the first C1 fix that I had reported to the user as an intentional improvement.

The segment rebase reset the de-dup window on EVERY jump, including backward ones, so scrolling to 900, scrubbing back to 0 and re-reading credited 1800 instead of 900. The old session-wide `maxPos` had prevented exactly that. Fixed by keeping a session-wide high-water mark (`sessionMaxPos`) and crediting only the part of a closing segment beyond it. The skipped-span exclusion that C1 is about is unaffected.

Worse than the bug: the original two tests never moved the position before the jump, so `segmentMaxPos - segmentStartPos` was always 0 at segment close. `closedSegmentWords` could be deleted entirely and all 19 tests passed. Added five scenarios that actually pin it: words before a jump, backward-jump re-read, several jumps in one sitting, jump straight to finalize, and checkpoint/flush monotonicity.

Also reverted a threshold-scaling change suggested in review: it fixed a real problem (C22) but reclassified a pre-existing test case, which is a design decision rather than part of C1. Logged as C22 instead.

Conventions pass: renamed the abbreviated fields, moved the static helper to a module function, cut five restatements of one comment, typed the test fixture, and added `Reading segment` to CONTEXT.md per its own rule that a term goes in the glossary before it goes in code.

C6, C4 and the C21 harness done, and C3 + C5 came with them.

`stats.ts` imported `db` directly, so none of the date maths was testable. Extracted the pure aggregation into `queries/stats-aggregate.ts` (`summariseStreak`, `buildWeeklyWpm`, `weekStartLocal`, `weeklyWpmHorizon`); `stats.ts` now only fetches rows. 29 tests run the same assertions under Europe/Berlin, America/New_York and Pacific/Auckland by setting process.env.TZ per describe, which works at runtime in this Node.

C6: the sub-minute filter now applies to the day's total instead of each sitting. C4: week-start keys and lookups both step in local days, so buckets before a DST change stop missing. C3 came free: longest-streak now walks day starts built from the key parts instead of reparsing 'YYYY-MM-DD', which JS parses as UTC midnight. C5 likewise, via previousLocalDayStart.

So TASK-159.3 no longer needs to fix C3 or C5, only to verify them.

Process note worth keeping: all four fixes were written before their tests, so I rebuilt the pre-fix logic verbatim in a throwaway file and ran the new assertions against it. C6, C3 and C4 failed as expected. C5 PASSED, exposing that my C5 test was vacuous: at a fall-back the buggy grid still yields 90 distinct dates. The real damage is at spring-forward, where it skips a calendar day and overshoots. Assertion changed to contiguous-and-ends-today, which does fail against the old logic. Without the mutation check this would have shipped as a fixed bug that was never tested.

AC #4 done now that the push-watermark work is committed (d5e8800), which had been the reason to leave `services/sync/index.ts` alone.

Added `partitionPushableSessions`, which screens each row against `SyncReadingSessionSchema` before the payload is built. The server safeParses the whole payload and 400s it, so one malformed row previously failed every other row in the push; combined with a watermark that only advances on acceptance, that was unrecoverable. Rejected rows are logged with their ids and left local.

Deliberate call: rejected rows still count toward the watermark. Holding it back for a row that can never be accepted would re-read and re-reject a permanently growing set on every push, which is the same wedge arriving more slowly. The trade is that an unpushable row stays local-only, which is the lesser harm and is now logged rather than silent.

5 tests added to push-selection.test.ts, including that a zero wpm passes (the C8 case) and that the watermark advances past a rejected row.

Second /rcktbs-review round. The correctness reviewer found that the segment fix traded overcounting for UNDERcounting, and fuzzed it: 200k sequences, 0 overcounts, 78,443 undercounts, worst case 2380 real words credited as 0.

Two causes, both reproduced before fixing. A peek-ahead poisoned the session high-water mark with a position never read, suppressing all later credit (read 300, peek at 40000, scrub back, read 2700 more -> recorded 300 instead of 3000). And a scalar high-water mark cannot represent a re-entered gap, so reading a range skipped earlier was dropped (600 instead of 900).

The fix removed segments entirely. Words read is now the merged length of `readSpans`: every forward move under the jump threshold credits `[lastPos, pos]` into a disjoint span set. Jumps credit nothing, backward moves credit nothing, and a range is credited if and when it is travelled forward. Simpler than the segment version and correct: my own fuzz over 200k sequences now reports 0 overcounts and 0 undercounts against a union-of-forward-moves reference. Kept as a permanent property test, since it caught what 28 example tests did not.

Conventions round: deleted a dead re-export block from stats.ts, replaced `weeklyWpmHorizon` with `weekStartsFor` (it duplicated the week grid `buildWeeklyWpm` already builds, and the two had to be kept in lockstep by hand), unexported `weekStartLocal`, moved the module from `db/queries/` (where every other file imports `db`) to `services/stats/aggregate.ts`, and cut comments that narrated the diff rather than the code.

Two test defects found and fixed: the DST describe.each built its timestamps at collection time, before beforeAll set TZ, so the two tests that exist to pin DST behaviour were themselves ambient-timezone dependent; and the entire longest-streak scan could be deleted with a green suite, because `Math.max(longest, current)` masked it in every case where the two coincided. Added a long-past-streak case and verified by mutation that it now goes red in all three timezones.

Logged rather than fixed: C23 (a row rejected by today's schema is dropped permanently, including one a later schema would accept) and C24 (session screening closes one of five ways the payload can 400).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Closes C1, C8, C6, C4, C21, and picks up C3, C5, C22, C23, C24 along the way.

**C1 — words read was inflated by jumps.** The jump guard suppressed the high-water mark on the jump tick but still advanced `lastPos`, so the next ordinary tick snapped across the skipped span: a 5000-word TOC jump followed by 20 words of reading recorded 5020.

Two fixes were attempted and discarded before the current one, both caught by review rather than by tests: a per-jump segment rebase (double-credited a range re-read after a backward jump, 1800 for 900), then a session-wide high-water mark on top of it (undercounted badly — a peek-ahead poisoned the mark and suppressed all later credit, 300 for 3000; and a re-entered gap was dropped, 600 for 900). A 200k-sequence fuzz on that version reported 0 overcounts and 78,443 undercounts.

What shipped is simpler than any of them: `readSpans`, a disjoint set of ranges travelled forward under the jump threshold. Each forward move credits `[lastPos, pos]`; jumps and backward moves credit nothing; a range is credited if and when it is travelled forward. Re-reads merge, skipped-then-read gaps count. Fuzz over 200k sequences against a union-of-forward-moves reference: 0 overcounts, 0 undercounts. That fuzz is kept as `session-tracker.property.test.ts` — it caught what 28 example tests did not.

**C8 — one row wedged sync permanently.** `wpmAvg` was `.positive()` but the tracker legitimately emits 0 (few words over many active minutes). The server safeParses the whole payload and 400s it, and the push watermark only advances on acceptance, so the row was resent forever. Relaxed to `.nonnegative()`, plus `partitionPushableSessions` to isolate any future malformed row instead of failing the batch.

**C6, C4, C3, C5 — date maths.** `stats.ts` imported `db` directly, so none of it was testable. Extracted `services/stats/aggregate.ts` (`summariseStreak`, `buildWeeklyWpm`, `weekStartsFor`); `stats.ts` now only fetches. The sub-minute filter applies to a day's total rather than each sitting; week keys and lookups both step in local days; longest-streak no longer reparses `YYYY-MM-DD` as UTC midnight; the 90-day window steps local days. C3 and C5 were scoped to TASK-159.3 and are done.

**C21 — test harness.** 33 tests in `services/stats/__tests__/aggregate.test.ts` under Europe/Berlin, America/New_York and Pacific/Auckland, across both DST transitions.

**Process, since it is the reusable part.** Three review rounds found, in order: a double-count regression reported to the user as an intentional improvement; tests that pinned nothing (every new field could be deleted with a green suite); a vacuous DST assertion (distinct-date-count passes against the buggy grid, because the damage is a skipped day at spring-forward, not a duplicate); DST tests whose timestamps were built at collection time in the ambient timezone; and a longest-streak scan that could be deleted entirely because `Math.max(longest, current)` masked it. Every one was caught by fresh-context review or mutation checking. The rules distilled from that are in STATS-IMPROVEMENTS.md section 7.

**Deferred, logged as items:** C22 (reading across a suspended poll timer is discarded; fixing it makes the jump threshold a rate, which reclassifies a pre-existing test case). C23 (a row rejected by today's schema is dropped forever, including one a later schema would accept — C8 is the proof). C24 (session screening closes one of five ways the payload can 400). C23 and C24 belong with TASK-159.4.

324 capacitor tests, 70 core, tsc clean, biome clean. Nothing committed.
<!-- SECTION:FINAL_SUMMARY:END -->
