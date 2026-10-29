---
id: TASK-223
title: Stats sync off on one device wipes the account's reading goals on every launch
status: Done
assignee: []
created_date: '2026-10-29 00:25'
updated_date: '2026-10-29 01:15'
labels: []
milestone: m-13
dependencies: []
priority: high
ordinal: 200000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Release review 2026-10-29 (two reviewers). syncStats is per-device (not in SYNCED_SETTING_KEYS) but clearServerGoalsWhileStatsOff (apps/capacitor/src/services/sync/index.ts ~239-251) calls /api/sync/wipe-goals, which hard-deletes all goal rows incl. tombstones (apps/web/src/lib/sync-wipe.ts ~58), on every app process start. Effects: other devices' goals vanish for buddies; deleted goals resurrect from a third device.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner decision (2026-10-29): goals are plans, not stats; they push and pull whatever syncStats says. With stats off only sessions stay local; hiding a buddy standing is done with live-reading sharing. Client: syncStats gating for goals removed on push and pull; the opt-out wipe call removed. Server: /api/sync/wipe-goals route and wipeReadingGoals deleted (commit 15a4c3a is in no tagged release; release.yml builds only on v* tags, v2.0.0 predates it). Delete reading stats still tombstones goals via wipe-sessions -> wipeReadingStats. Goal stamps are NOT clamped to server time: goals are pushed in full every push, so a clamp gives a fast-clock device a fresh 'now' on every push and lets it beat newer edits indefinitely; unclamped, it wins only until real time passes its stamp. Books and settings are also pushed in full and clamp, so they likely share that flaw (not changed here). Tests: goal-sync-gating (goals push+pull with stats on and off, no wipe call), sync-goal-upsert integration (resent unchanged goal can't beat a newer edit; fast-clock stamp stored as sent), goal-status integration (Delete reading stats tombstones). Docs: CONTEXT.md reading goal + buddy standing, agents/capacitor.md What syncs, Danger-zone copy in settings/sync.tsx.

Planner verification (2026-10-29): 3 reviewers + verifier, 1 fix round; all items FIXED. tsc clean (web, capacitor), sync+reader vitest 458/458, targeted e2e green (2 import-setup timeouts passed on rerun). Planner fixed 2 stale wordings (sync-wipe.ts comment, CONTEXT.md 'like settings'). Remaining LOWs: no e2e for a chunk-crossing turn mid-slide or the start-of-book edge; gating test doesn't assert sessions stay gated; a fast-clock device can bring back a goal after Delete reading stats until real time passes its stamp (see TASK-226).
<!-- SECTION:NOTES:END -->
