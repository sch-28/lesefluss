---
id: TASK-216
title: >-
  Page mode while listening: a turn during the slide is reverted by the next
  spoken word
status: To Do
assignee: []
created_date: '2026-10-26 03:15'
labels:
  - reader
  - page-mode
  - read-aloud
milestone: m-14
dependencies: []
priority: low
ordinal: 189000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the independent TASK-206 verification (pre-existing UX). In page mode with read-aloud following, a tap/key turn during the 220 ms slide is reverted when a spoken word arrives (handleSpokenWord → followWord → jumpAfterTurn drops the turn's settle, moveTo puts the voice page back). No detach happens, so the user can't peek ahead while listening in page mode. The DB stays correct. Expected: a user turn detaches the view from the voice (as a scroll does in scroll mode).
<!-- SECTION:DESCRIPTION:END -->
