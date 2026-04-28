---
id: TASK-37.9
title: 'Web novels: popular shelves on empty search'
status: To Do
assignee: []
created_date: '2026-04-28 22:41'
labels: []
milestone: m-4
dependencies: []
parent_task_id: TASK-37
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When the user lands on `/tabs/explore/web-novels` (or after clearing the search box) the page shows a blank space until they type. We should fill that space with popular/trending serials so the discovery surface earns its real estate from the first paint — and so the user has something to tap when they don't know what to search for.

**Recommended scope: Royal Road + Wuxiaworld only.**

The "All" merged-search ranking already biases toward providers with covers + chapter counts (RR, WW). Limiting popular shelves to those two providers compounds that bias on the empty state, keeps scraping surface small, and lets us ship without per-provider parser work for AO3 / ScribbleHub. Those two stay reachable via the filter chips with the existing on-type search.

When the user picks a provider chip with no query, show only that provider's shelf (or an empty/CTA state if the provider is one we don't support yet — AO3 / SH).

**Out of scope (follow-ups):**
- Popular shelves for AO3 and ScribbleHub.
- Personalization / "for you" ranking.
- Caching popular results to disk; in-memory react-query cache is enough for the first cut.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Empty search on /tabs/explore/web-novels with no provider filter shows two horizontal shelves: 'Popular on Royal Road' and 'Popular on Wuxiaworld'
- [ ] #2 Each shelf shows the same card layout the search results grid uses (cover, title, author or chapter count), and tapping a card opens the existing web-novel preview
- [ ] #3 Empty search with provider filter set to Royal Road or Wuxiaworld shows only that provider's popular shelf, full-width
- [ ] #4 Empty search with provider filter set to AO3 or ScribbleHub shows a soft 'Type to search' empty state (no shelves), so the chip remains useful but doesn't fake content
- [ ] #5 Once the user types a query, popular shelves are replaced by the live search results — typing immediately hides the shelves with no flicker
- [ ] #6 If a provider's popular endpoint fails, the corresponding shelf is hidden silently (no blocking error); the other shelf still renders
- [ ] #7 Popular fetches are deduped/cached for the session via react-query so navigating back to the page doesn't re-hit the network on every visit
- [ ] #8 New per-adapter `getPopular()` paths have unit tests against captured HTML/JSON fixtures, matching the pattern in services/serial-scrapers/__tests__/providers/
<!-- AC:END -->
