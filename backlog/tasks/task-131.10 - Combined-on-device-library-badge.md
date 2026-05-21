---
id: TASK-131.10
title: Combined "on device" library badge
status: Done
assignee: []
created_date: '2026-05-20 18:00'
updated_date: '2026-05-21 01:48'
labels: []
dependencies:
  - TASK-131.9
parent_task_id: TASK-131
ordinal: 36000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Render a per-book badge using the state from `useBookDeviceState` (TASK-131.9). Single badge, two variants:

- "On device" — book is uploaded but the device's reader is not currently displaying it.
- "Reading on device" — book is uploaded AND device's active book matches.

Visibility:
- Visible only when connected to a device (D3). Disconnected: no badge.
- Applies to both single-book and multi-book device classes. For single-book the active and on-device states collapse (the one book is always the active one), so the badge shows "Reading on device" when present.

Surfaces:
- Library list rows (`pages/library/book-card.tsx`, `book-list-item.tsx` if separate).
- Book detail header (`pages/library/book-detail.tsx`).

Visual: existing `Badge` UI component, neutral color for "On device", accent/active color for "Reading on device".

Out of scope:
- Offline / cached badges (D3 explicitly opted out).
- Per-book progress sync indicator (position sync is deferred).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Badge appears on library rows for any book whose `useBookDeviceState` returns `isOnDevice: true`
- [x] #2 Badge variant flips to 'Reading on device' when `isActiveOnDevice: true`
- [x] #3 No badge renders when disconnected
- [x] #4 Behavior parity for single-book device: the single uploaded book shows the active variant
- [x] #5 Badge appears on book-detail header in the same conditions
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
DeviceBadge component reads live device state via useBookDeviceState (TASK-131.9) and renders:
- "Reading on device" variant (accent color) when the connected device is currently showing the book
- "On device" variant (neutral) when uploaded but not the device's active book
- Nothing when disconnected or absent

Three style variants: `inline` (default — absolute pill for card corners), `block` (stacked uppercase label for list rows), `text` (plain span for composing into existing inline statlines).

Wired into:
- pages/library/book-card.tsx (inline pill)
- pages/library/book-list-item.tsx (block label)
- pages/library/book-detail.tsx (text composed into the stats line)

Removed the stale `isActive` prop from book-card / book-list-item (it was deriving from app-side activeBookId which is the wrong source for the device-presence question, especially for multi-book devices). Parent `pages/library/index.tsx` stopped computing it.

203/203 tests pass.
<!-- SECTION:FINAL_SUMMARY:END -->
