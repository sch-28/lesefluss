---
id: TASK-160
title: 'Web profile: surface reading session stats (P13)'
status: To Do
assignee: []
created_date: '2026-07-28 19:40'
labels: []
milestone: m-7
dependencies:
  - TASK-159.2
documentation:
  - STATS-IMPROVEMENTS.md
priority: low
ordinal: 71000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`apps/web/src/routes/_authenticated/profile/index.tsx` shows the user's library and highlights but no reading statistics, even though reading sessions already sync and `sync_reading_sessions` exists at `apps/web/src/db/schema.ts:183`. `apps/web/src/lib/profile.ts` queries `syncBooks`, `syncHighlights` and `syncGlossaryEntries` only.

Separate from the TASK-159 family because it is a different app with no shared code path beyond the sync tables, and it can be built independently once the metric definitions there settle.

Scope it to aggregate numbers only. Detail charts are deliberately out of scope: the session-segment work considered in the TASK-159 family (see decision D7 in `STATS-IMPROVEMENTS.md`) may keep per-segment detail local to the device, in which case the web profile can never have it. Aggregates come from synced session rows and are always available.

Depends on TASK-159.2 for the metric definitions, so the profile does not repeat the mistake of headlining an RSVP dial setting as a reading speed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The profile page shows total reading time, words read, and books finished from synced sessions
- [ ] #2 Any speed figure shown uses the same definition and labelling as the app, not the raw wpm_avg column
- [ ] #3 The page behaves sensibly for an account with no sessions
- [ ] #4 A user whose stats sync toggle is off is not shown misleading partial figures
<!-- AC:END -->
