---
id: TASK-46.2
title: 'Per-resource sync toggles (highlights, glossary, stats)'
status: To Do
assignee: []
created_date: '2026-04-30 23:30'
updated_date: '2026-04-30 23:31'
labels: []
milestone: m-5
dependencies: []
parent_task_id: TASK-46
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add three per-resource sync opt-outs to the Cloud Sync settings page. Independent of the stats schema work — can ship before, after, or in parallel with task-46.1.

## Schema

Three new booleans in `apps/capacitor/src/services/db/schema.ts` settings table, default `true`:
- `syncHighlights`
- `syncGlossary`
- `syncStats`

Drizzle migration `apps/capacitor/drizzle/0023_sync_toggles.sql`. Local-only — do NOT mirror to web Postgres or to `SyncSettingsSchema`. These are device preferences, not synced state.

## Sync gates

In `apps/capacitor/src/services/sync/index.ts`:
- Push: when building the payload, send `[]` for any resource whose toggle is off.
- Pull: skip the merge block for any resource whose toggle is off (so disabling a resource locally also stops it being pulled back from another device).

Behavior is non-destructive: server keeps whatever it has. Toggling back on resumes sync, and last-write-wins resolves any divergence the usual way.

## UI

In `apps/capacitor/src/pages/settings/sync.tsx`, when `isLoggedIn`, add a new `IonList` section "Sync data" with three `IonToggle` rows. Each row:
- Label: "Highlights" / "Glossary entries" / "Reading stats"
- Helper text under the label clarifying off-state ("Existing cloud data is kept. Turning off only stops this device from syncing new changes.")

For the stats toggle specifically, append: "Stats are only collected on this device when off — they never leave it."

## Out of scope

- Tracking-disable toggle (we're not adding one; off = local-only stats, which is enough).
- Per-resource toggles for books or settings themselves (those are the spine of the app — all-or-nothing is fine).</description>
<acceptanceCriteria>["Three boolean columns added to settings table with migration; defaults `true`", "Settings → Cloud Sync shows three toggles when logged in: Highlights, Glossary entries, Reading stats", "Toggle off prevents both push and pull merge for that resource on this device", "Toggle off does NOT delete cloud data (verify by toggling off, syncing, then toggling on and observing data returns)", "Toggles are not themselves synced (changing on device A doesn't change device B)", "Helper copy explains the non-destructive behavior in plain language"]
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Three boolean columns added to settings table with migration; defaults `true`
- [ ] #2 Settings → Cloud Sync shows three toggles when logged in: Highlights, Glossary entries, Reading stats
- [ ] #3 Toggle off prevents both push and pull merge for that resource on this device
- [ ] #4 Toggle off does NOT delete cloud data (verify by toggling off, syncing, then toggling on and observing data returns)
- [ ] #5 Toggles are not themselves synced (changing on device A doesn't change device B)
- [ ] #6 Helper copy explains the non-destructive behavior in plain language
<!-- AC:END -->
