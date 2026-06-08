---
id: TASK-157
title: 'Research: EPUB reading progress resets for no-account (sync-off) Android users'
status: To Do
assignee: []
created_date: '2026-06-07 22:41'
updated_date: '2026-06-08 22:13'
labels:
  - bug
  - reader
  - sync
  - android
  - research
dependencies: []
references:
  - apps/capacitor/src/pages/reader/index.tsx
  - apps/capacitor/src/pages/reader/pending-position.ts
  - apps/capacitor/src/services/sync/index.ts
  - apps/capacitor/src/services/db/queries/books.ts
priority: high
ordinal: 61000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Recurring user feedback: "I don't have an account. It won't save progress on epub read." Multiple reports over time despite our save/seed/reconcile unit tests passing. This task is to REPRODUCE and root-cause before any fix.

KEY STRUCTURAL INSIGHT (why our tests miss it):
- `wordPosition` is the only copy locally for no-account users. With an account, every app open runs `fullSync()` -> `pullSync()` which re-hydrates `wordPosition` from the server (services/sync/index.ts ~595-607). Sync MASKS any local-only persistence/clobber bug. So account users and any sync-on test never see it. The no-account cohort is the ONLY unshielded population, which is exactly who reports it.
- Therefore the bug lives in the LOCAL-ONLY path and must be reproduced with sync DISABLED.

NARROWED SCOPE from reporter triage:
- Platform: Android native (Capacitor, @capacitor-community/sqlite). NOT web.
- Books themselves persist (covers/titles survive across restarts) and ONLY the reading position resets. => The local DB IS durably persisting writes. This rules OUT storage eviction / OPFS-IndexedDB loss. The defect is specific to `wordPosition` being overwritten/lost, not the DB layer.

So the question is precisely: in the no-account, sync-off, Android path, what writes a STALE or zero `wordPosition` over the real one (or fails to persist the latest), while the rest of the book row survives?

Suspects to investigate (do not assume, verify each with a repro):
1. Stale-seed clobber on a TanStack Router transient re-mount of BookReader (see memory "reader-unmount-double-fire"): seed effect re-applies `book.wordPosition` from a possibly stale query cache, and/or an unmount flush writes a stale `lastWordRef`. Check the `userMovedRef` / `pendingSnapshotRef` gating in apps/capacitor/src/pages/reader/index.tsx (~245-318, ~466-525) holds on Android route changes.
2. Android lifecycle: app pause/background freezes the WebView and may kill the process. A throttled/debounced position that never reached `savePosition` also never reached `writePendingPosition` (the durable fallback only mirrors positions that already went through savePosition). Determine if the latest scroll position is flushed on Capacitor App pause/resume, or lost.
3. Durable-fallback recovery gate `pending.at > seedLastRead` (reader/pending-position.ts) and the same-millisecond stamping in savePosition: confirm it never drops a legitimately newer pending position on reopen.

Investigate with sync explicitly OFF. Reproduce on an Android build (or a faithful native-lifecycle simulation), not just happy-dom/unit env (see memory "epub-test-env-limits").
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A deterministic repro of progress reset is produced in the no-account / sync-disabled path (failing test or documented manual Android repro steps)
- [ ] #2 Root cause is identified and written up: exactly which code path overwrites or fails to persist wordPosition while the rest of the book row survives
- [ ] #3 Confirmed the issue does NOT reproduce when sync is enabled (validates the sync-masking hypothesis)
- [ ] #4 Fix lands with a regression test that exercises the local-only path (sync off) and would have caught the original bug
- [ ] #5 Android app pause/resume mid-read is covered: the latest read position survives backgrounding and process kill without an account
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Static investigation (2026-06-08) — no logic bug found, prime suspect is native durability

Read the full reader save/restore lifecycle (apps/capacitor/src/pages/reader/index.tsx, pending-position.ts, use-rsvp-engine.ts, services/db/adapter.ts, services/db/index.ts). The React-level path is hardened and is NOT the bug:
- Every save path (scroll settle ~657, word tap ~760, jump ~551, scrub, RSVP throttle ~1044) sets `lastWordRef` + `userMovedRef`.
- Background is flushed three ways at the reader level (index.tsx ~1232): `pagehide`, `visibilitychange:hidden`, and Capacitor `pause`, all gated `userMovedRef.current` to avoid stale-seed clobber.
- RSVP throttle save (2s) updates the refs too, so the reader-level visibility flush also covers RSVP on Android (engine's own flush is `pagehide`-only, web). Worst case there is ~2s drift, not a reset.
- Durable fallback (pending-position.ts) write-before-await + reconcile gate `pending.at > seedLastRead` is correct.

This explains why unit tests pass: the logic IS correct. The failure is one layer lower.

## PRIME SUSPECT: localStorage durable-fallback not surviving Android hard kill

Chain:
1. `savePosition` writes the latest position synchronously to `localStorage` (pending-position.ts), then `await queries.updateBook` (async, serialized through `adapter.ts` writeQueue), then clears the fallback.
2. On Android background, if the OS freezes JS before the queued `updateBook` executes, nothing reaches SQLite (so WAL has nothing to recover either).
3. The fallback is then the only copy. But Android System WebView buffers `localStorage` to disk lazily; a swipe-away / low-memory kill can drop the un-flushed buffer.
4. Both copies of the LATEST position are lost. Only older checkpointed rows survive, so books (written once at import) persist while recent `wordPosition` resets. Matches the reported symptom exactly.
5. With an account, `pullSync()` re-hydrates `wordPosition` on next open, hiding this from everyone except no-account users (see memory: sync-masks-local-progress-bugs).

## Recommended fix direction
Back the pending-position with `@capacitor/preferences` on native instead of `localStorage` (Preferences -> Android SharedPreferences, durable across hard kill). Already a dependency (services/db/index.ts:3). Keep `localStorage` on web (it flushes on `pagehide`). Then verify with the on-device swipe-kill repro in AC #1.

Secondary hardening to consider: have the Capacitor `pause` flush write the pending fallback synchronously even if it's already covered, and confirm the writeQueue doesn't strand the final `updateBook` behind earlier writes during the freeze window.

NOTE: this is a hypothesis with strong circumstantial support, not a confirmed repro. Confirm on a real Android device before committing to the fix.

## On-device repro attempt + observability shipped (2026-06-08)

Reproduced NOTHING on a real device (Huawei VOG-L29, Android 10), no account, sync off, across: scroll (fast + reading-pace), page mode, RSVP, small Explore book AND a large imported EPUB (Name of the Wind), and every teardown (force-stop foreground, HOME+am kill, back-nav, app exit + relaunch). Temporary logcat instrumentation proved every save reaches db-committed, pending is null on reopen (SQLite commits durably), and seed restores the exact word. So the current build's save/restore path is solid on that hardware; the durability hypothesis (fix attempts #1/#2 direction) is NOT supported. Reporter is on latest (v1.4.5, has the 73c41e3 hardening) and reported today, so it's a real bug we cannot reproduce, not a stale pre-fix report.

Root finding that changes strategy: the app SWALLOWED all DB write errors (adapter writeQueue `.catch(()=>{})`) and has NO client telemetry. A silent write failure/hang on a user's device would be completely invisible to us, which fits 'never saves for them, works in all our tests'. Since the reporter is anonymous (no contact, no metadata), the only way to learn is aggregate telemetry.

Shipped (anonymized diagnostics, opt-out):
- apps/capacitor: new services/telemetry (anonymous POST to /api/telemetry, ephemeral per-launch session id, throttled, never throws); adapter.ts now reports db_write_error instead of swallowing; savePosition has an 8s watchdog -> position_write_timeout (catches a wedged/hung write queue that never rejects); pending-position reports localstorage_unavailable; Settings > Privacy opt-out toggle (default on).
- apps/web: /api/telemetry route (cors, no auth, IP rate-limited), telemetry_events table + migration 0014, tablesFilter updated. Verified end-to-end against a throwaway Postgres: migration chain applies, anonymous POST inserts row, 400 on missing type, CORS allows capacitor://localhost. Privacy policy page updated to disclose app diagnostics + opt-out.

REMAINING (manual): deploy apps/web (migrate runs at startup via entrypoint.sh), ship a capacitor release with the telemetry, and change the Play Data Safety answer for Crash logs/Diagnostics from 'Required' to 'Users can choose' (Optional) now that there's a toggle. Then watch telemetry_events for db_write_error / position_write_timeout / localstorage_unavailable from affected devices to finally pinpoint the failing layer.

## New feedback 2026-06-08 (likely same reporter) — CRITICAL new repro lever

Verbatim: "It's impossible to read an epub if it looses progress every time I quit the app OR GO BACK TO THE LIBRARY." (type: bug, platform not specified, source: app, anonymous).

Key new signal: progress is lost on a normal in-app BACK to library, NOT only on app kill. And "every time" => systematic, not a kill-timing race. This is the React unmount path, reproducible WITHOUT any process kill.

The reader's unmount flush (index.tsx ~1215) is gated `if (word !== null && userMovedRef.current)`. Prime suspect now: on this user's device the TanStack-router reader->library transition does a transient re-mount of BookReader (see memory reader-unmount-double-fire); the reset effect sets userMovedRef=false before the real unmount, so the unmount flush is SKIPPED every time -> last reading position never written on back-nav. That matches "every time you go back" exactly. Why it didn't reproduce on my Huawei A10 earlier: my back->reopen test showed the committed value restored, so either (a) the transient-remount ordering is device/router-timing dependent, or (b) the user reads in a way where the per-scroll settle saves don't fire (so only the unmount flush would save, and it's gated off).

Next-session repro plan (do NOT blind-fix): on device, instrument userMovedRef + the unmount-flush branch (did it run? value? userMoved?) and the transient-remount reset, then BACK to library and watch. Specifically test: read a bit, go back to library, reopen -> is position lost? Try slow device / different navigation (hardware back vs in-app back arrow vs back-swipe gesture). Confirm whether the per-scroll settle saves are firing at all for this flow, or only the unmount flush. If the unmount flush is being skipped due to a transient-remount reset of userMovedRef, the fix is to not let a transient remount drop a legitimate pending position (e.g. persist via the durable pending-position fallback regardless of userMovedRef, or seed userMovedRef/lastWordRef from the recovered pending so the flush still fires).

Note: telemetry (db_write_error / position_write_timeout) is built but NOT deployed yet, so still no field data. Deploying apps/web + shipping the telemetry release would also catch this if it is a write failure rather than a skipped flush.

## Telemetry pipeline confirmed live + skip-path breadcrumb added (2026-06-08)

Prod /api/telemetry POST returns 200 and the row lands (manual pipeline_test verified by user in prod DB). Migration 0014 ran in prod. So the pipeline works. Telemetry was released ~12h before the latest report, yet telemetry_events has ZERO real-client rows. Since our events only fire on WRITE failures (db_write_error / position_write_timeout / localstorage_unavailable), zero rows means no write failures in the field. Combined with the new 'loses progress when I go back to the library' detail, this rules OUT the write-failure hypothesis and supports the SKIPPED-FLUSH hypothesis: on back-nav no save is even attempted (unmount flush gated off by userMovedRef), so there is nothing for write-error telemetry to catch.

Added a targeted breadcrumb to make the skip path observable: `position_flush_skipped` (extra: {origin: unmount|background, word, seed}). Fires from both teardown paths (unmount cleanup ~1260, background pause/visibility/pagehide flush ~1280) ONLY when lastWordRef !== null && !userMovedRef.current && lastWordRef !== seededWordRef (moved away from the resumed position but not saving). New `seededWordRef` records the seed-effect resume word. Low-noise: benign opens (no move) and transient-remount instances (lastWord===seed) do NOT fire; only a genuine moved-but-flag-false fires. No server change needed (endpoint accepts any type + extra). tsc clean, all 244 tests pass.

NEXT: ship a capacitor release with this breadcrumb, then watch telemetry_events for position_flush_skipped. If it appears correlated with the affected cohort -> confirms the mechanism; fix = don't let a transient remount drop a real position (recover via durable pending-position regardless of userMovedRef, or seed userMovedRef/lastWordRef so the unmount flush still fires). If it does NOT appear despite continued reports -> the loss is a CLOBBER (flush runs but saves a stale/seed value) or a reopen-seed issue, and we instrument that next (e.g. report when a teardown save REGRESSES below the last-saved word, or when seed resolves to a value older than a known-saved one).

## Mitigation shipped (2026-06-08): ungated teardown durable-save safety net

Mechanism-agnostic safety net so progress can't be lost even without a confirmed root cause. Both teardown paths (unmount cleanup + background pause/visibility/pagehide flush): when the gated DB save is SKIPPED (userMovedRef false) but the position moved from the resume point (lastWordRef !== seededWordRef), now also `writePendingPosition(id, word, Date.now())` directly to the durable localStorage fallback (alongside the position_flush_skipped breadcrumb). Previously the skip path wrote NEITHER the DB nor the fallback (writePendingPosition only ran inside savePosition, which the skip bypasses) -> latest position lost on reopen. Reopen recovery is unchanged and timestamp-gated, so this can't clobber a newer committed/synced value.

Refactor: extracted the resume reconcile into pure `recoverPendingWord(seedWord, seedLastRead, pending)` in pending-position.ts (behavior-identical) and used it in the seed effect. New pending-position.test.ts (7 cases) covers the rule + the safety-net round-trip (a skipped-teardown mirror is recovered; a stale fallback is not resurrected once the DB catches up). tsc clean, full suite 251 pass. Not device-smoke-tested (phone disconnected) but additive + behavior-preserving; low risk.

Changelog (packages/core): added "More reliable saving of your reading position when you leave a book or background the app" to the 2026-06-08 entry, framed as reliability hardening (NOT a claimed root-cause fix). The position_flush_skipped breadcrumb still runs underneath to confirm the mechanism in the field for a proper fix later.

## DECISION PLAN — how to converge (2026-06-08)

We cannot reproduce and cannot contact the anonymous reporter. The breadcrumb fires on ANY device that actually drops a real move, so we converge by reading the field telemetry over a TIME BOX, not by reproducing. Absence of signal at scale IS evidence.

TIME BOX: review when the build carrying `position_flush_skipped` has been live ~2-4 weeks with real usage. Target review date: ~2026-07-01 (adjust to the actual release date of that build).

How to read the data (prod):
  SELECT type, app_version, count(*) AS n, max(created_at) AS last
  FROM telemetry_events
  WHERE type IN ('position_flush_skipped','db_write_error','position_write_timeout','localstorage_unavailable')
  GROUP BY type, app_version ORDER BY n DESC;
(Filter app_version to the build(s) that contain the breadcrumb. extra->>'origin' and extra->>'word'/'seed' carry the flush-skip detail.)

DECISION TABLE:
- `position_flush_skipped` rows present -> Scenario 2 CONFIRMED (skipped-flush). The safety net is already mitigating; do the precise root-cause fix (stop the transient remount from resetting userMovedRef / from dropping the position) and keep the net as belt-and-suspenders. Add AC #4 regression test from the real mechanism.
- `db_write_error` / `position_write_timeout` / `localstorage_unavailable` rows present -> Scenario 2, write-layer. Fix that layer (e.g. Preferences-backed fallback, write-queue wedge).
- ZERO rows across meaningful usage -> Scenario 1 (reporter on old version; prod fine) or Scenario 3 (perception/UX confusion, not data loss). Either way NO live bug in the current build. Stop. Execute the cleanup below and close this task as 'not reproducible, no field signal'.

KEEP REGARDLESS (net-positive infra/correctness, do NOT revert):
- services/telemetry/* pipeline; adapter.ts un-swallow + db_write_error; savePosition 8s watchdog -> position_write_timeout; pending-position localstorage_unavailable report; Settings>Privacy opt-out toggle; apps/web /api/telemetry route + telemetry_events table + migration 0014 + privacy policy; save-failure toast (notifyLocalSaveFailure); recoverPendingWord refactor + pending-position.test.ts; e2e position-back-to-library.spec.ts; auth-client import.meta.env?. guard (real fix for Playwright Node import crash).

PROVISIONAL — REVERT IF ZERO ROWS (speculative, added complexity to fragile teardown for an unconfirmed cause):
- reader/index.tsx: `seededWordRef` (3 spots: declaration, reset effect, seed effect set).
- reader/index.tsx: the two teardown else-if branches (unmount cleanup + background flush) that call `writePendingPosition(...)` and `reportEvent('position_flush_skipped', ...)` — i.e. the safety net + breadcrumb. seededWordRef exists only to serve these, so it goes with them.
- Optional: keep them as cheap defense-in-depth if preferred; they are behavior-preserving (only fire when data would otherwise be lost). The revert is about not carrying speculative branches in the delicate teardown path, not about a known bug.

Note on Scenario 3: if reports keep trickling in while telemetry stays empty, treat it as a UX-clarity problem (make 'where you resumed' obvious), not more save plumbing.
<!-- SECTION:NOTES:END -->
