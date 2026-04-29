---
id: TASK-103
title: 'Web novels: download all chapters with human-like throttling'
status: Done
assignee: []
created_date: '2026-04-26 09:35'
updated_date: '2026-04-26 16:40'
labels: []
milestone: m-11
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a "Download all chapters" button on SeriesDetail that fetches every `pending` chapter sequentially with deliberate human-like delays between requests, so we don't hammer upstream providers and risk IP bans.

**Behaviour:**
- Button visible on SeriesDetail when the series has one or more `pending` chapters.
- Fetches chapters one at a time (not in parallel), with a randomised delay between each request (e.g. 1.5–4 s), mimicking a slow human reader.
- Shows a progress indicator (e.g. "Downloading 3 / 47…") so the user knows it's working.
- Can be cancelled mid-way; already-fetched chapters are kept.
- Respects the existing per-provider throttle gate in `services/serial-scrapers/fetch.ts` so any provider-level rate limiting still applies.

**Out of scope:**
- Background/offline download after the app is closed.
- Parallel fetching or batching.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Download all button appears on SeriesDetail when chapters with status='pending' exist
- [ ] #2 Chapters are fetched strictly sequentially with a randomised 1.5–4 s delay between each request
- [x] #3 Progress label updates after each successful fetch (e.g. 'Downloading N / total')
- [x] #4 Cancel button stops the download loop; chapters fetched so far are persisted
- [x] #5 Button is hidden / disabled while a download is already in progress
- [x] #6 Errors on individual chapters are logged and skipped; the loop continues to the next chapter
- [x] #7 pnpm check-types passes
<!-- AC:END -->
