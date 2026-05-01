---
id: TASK-46
title: Reading statistics page
status: In Progress
assignee: []
created_date: '2026-04-26 15:59'
updated_date: '2026-04-30 23:33'
labels: []
milestone: m-5
dependencies: []
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Local-first reading statistics. Aggregates across devices when logged in via existing sync (last-write-wins on session rows). No server-side analytics, no telemetry — every row is owned by the user and only leaves the device through the same sync path used for books/highlights/glossary.

## Scope

**Tracked:** in-app reader sessions only (scroll reader + in-app RSVP). ESP32 reading is out of scope — no clock, no storage budget, and bidirectional position sync would mean the same passage gets logged twice.

**Entry points:**
- Library page header: small chart icon, opens `/tabs/library/stats`.
- Book detail page: per-book stats card ("4h 12m across 9 sessions").
- No new tab.

**Stats page contents (v1):**
- Today / 7d / 30d / all-time totals: minutes read, words read, books finished
- Current + longest streak (consecutive days with ≥1 min)
- Per-book leaderboard for current month
- WPM trend over time (RSVP sessions only)

Skip for v1: time-of-day heatmaps, genres, per-chapter breakdowns, "Wrapped"-style yearly recap (the schema supports it; ship a separate task when we want it).

## Opt-out

Lives in Settings → Cloud Sync as part of a wider per-resource sync toggle set (highlights, glossary, stats), defaulted on. "Off" stops outbound push and ignores inbound merge for that resource on this device. Existing cloud data is preserved (non-destructive). No tracking-disable toggle — stats are computed from local sessions, off means "stay on this device."

## Breakdown

Implemented across four child tasks:

1. **task-46.1** — Reading sessions: schema, tracking, sync wire (foundation; blocks 46.3 / 46.4)
2. **task-46.2** — Per-resource sync toggles in Sync settings (independent, can ship in parallel)
3. **task-46.3** — Stats page (Library header icon + `/tabs/library/stats`)
4. **task-46.4** — Per-book stats card on book detail page

Parent stays open until all four are done.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All four child tasks (46.1, 46.2, 46.3, 46.4) are Done
- [ ] #2 Reading sessions are logged for in-app scroll and RSVP modes only (ESP32 sessions explicitly out of scope)
- [ ] #3 Stats are reachable from a Library header icon and a per-book card on book detail — no new tab
- [ ] #4 Sync settings page exposes per-resource toggles for highlights, glossary, and stats; defaults on; toggling off is non-destructive (cloud data preserved)
- [ ] #5 Privacy posture documented in-app where relevant: stats live on-device unless the user is signed in and has the stats sync toggle on
<!-- AC:END -->
