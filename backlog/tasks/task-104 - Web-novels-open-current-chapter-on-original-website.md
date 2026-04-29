---
id: TASK-104
title: 'Web novels: open current chapter on original website'
status: Done
assignee: []
created_date: '2026-04-26 09:35'
updated_date: '2026-04-26 16:14'
labels: []
milestone: m-11
dependencies: []
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a way for the user to open the chapter they are currently reading in the in-app browser (or system browser) on the provider's original website. Useful when a chapter fails to load, for accessing author notes, or for leaving a rating/comment on the source.

The `chapter_source_url` column already exists on `books` rows for serial chapters — use that as the target URL.

A sensible placement is a context-menu item or icon button in the reader toolbar / overflow menu.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Reader toolbar or overflow menu exposes an 'Open on [Provider]' action for serial chapters that have a chapter_source_url
- [x] #2 Tapping the action opens chapter_source_url in the in-app browser (CapacitorBrowser) or falls back to system browser
- [x] #3 Action is hidden for non-serial books (no series_id) and for chapters missing a source URL
- [x] #4 pnpm check-types passes
<!-- AC:END -->
