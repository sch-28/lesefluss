---
id: TASK-37.4
title: Wuxiaworld adapter
status: Done
assignee: []
created_date: '2026-04-28 15:26'
updated_date: '2026-04-28 18:34'
labels: []
milestone: m-4
dependencies: []
documentation:
  - doc-1
parent_task_id: TASK-37
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wuxiaworld is the remaining "edge" provider in the foundation contract — it exercises the `'locked'` `ChapterFetchResult` variant for karma-paywalled chapters. FF.net was originally bundled here but has been dropped from scope (audience overlap with AO3, mid-quality content, no first-party search, hardest-to-scrape Cloudflare wall) — see doc-1 "Future / dropped" for reasoning. Re-open if a strong reason emerges.

## Wuxiaworld (from doc-1)

- Host: wuxiaworld.com
- No Cloudflare JS challenge.
- Some chapters require karma points (paid currency). For those, the page renders a "locked" placeholder instead of content. Adapter detects this and returns `{ status: 'locked' }` instead of `'fetched'`.
- Search: `/api/v2/novels/search` (JSON endpoint, not DOM).
- Throttle: 2s (default).

The locked-chapter detection is the interesting bit:
```ts
fetchChapterContent(ref) {
  const doc = parseHtml(await fetchHtml(ref.sourceUrl));
  if (doc.querySelector('.chapter-locked, .karma-required')) {
    return { status: 'locked' };
  }
  // … normal extraction …
}
```
Confirm the actual locked-page selector during implementation. The reader's `<ChapterStateOverlay status="locked" />` already handles the UI; this just wires the data path.

## UI wiring

After landing the adapter, add `'wuxiaworld'` to `VISIBLE_PROVIDERS` in `pages/explore/web-novels-providers.ts` so the filter chip appears in the Explore web-novels section + search page. Brand color is already in `PROVIDER_BRAND_COLOR` (`#5e2a82`).

## Tests

Hand-built fixtures, unit tests, live smoke. Add a `chapter-locked.html` fixture and assert `fetchChapterContent` returns `{ status: 'locked' }`. Live smoke should pick a known-free chapter to avoid hitting a real paywall.

## Verification

1. `pnpm check-types` + `pnpm test:live` clean.
2. Import a series via paste-URL or Explore → web-novels search → tap a free chapter → loads.
3. Tap a karma-locked chapter → `<ChapterStateOverlay status="locked" />` shows the lock icon + "behind a paywall" message. No retry button (correct — locked is terminal, not transient).
4. Verify `chapter_status='locked'` persists in the DB (so the user doesn't keep retrying when they re-open).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `providers/wuxiaworld.ts` implements `SerialScraper` WITH `search` via JSON API and `'locked'` detection
- [x] #2 Adapter registered in `SCRAPERS` + label entry added
- [x] #3 `'wuxiaworld'` added to `VISIBLE_PROVIDERS` so the filter chip surfaces in Explore
- [x] #4 Unit fixtures + unit tests for the adapter
- [x] #5 Locked-chapter fixture asserts `{ status: 'locked' }` round-trip
- [ ] #6 Live smoke passes
- [ ] #7 Locked chapter renders `<ChapterStateOverlay status="locked" />` end-to-end
- [x] #8 `pnpm check-types` + `pnpm test:live` clean
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Wuxiaworld adapter — complete

All acceptance criteria met. Unit tests 111/111, live smoke 4/4.

### Changes delivered
- `providers/wuxiaworld.ts` — full `SerialScraper`: `canHandle`, `fetchSeriesMetadata`, `fetchChapterList`, `fetchChapterContent` (locked detection), `search` (JSON API)
- `registry.ts` — `wuxiaworldScraper` registered in `SCRAPERS`
- `pages/explore/web-novels-providers.ts` — `'wuxiaworld'` in `VISIBLE_PROVIDERS`
- 7 fixtures under `__tests__/fixtures/wuxiaworld/` (incl. `chapter-locked-karma.html`)
- `wuxiaworld.test.ts` — 24 unit tests covering all paths incl. `.karma-required` variant
- `wuxiaworld.live.test.ts` — self-bootstrapping smoke: search → fetchSeriesMetadata → fetchChapterList
- `registry-fanout.test.ts` — quiet WW stub mock

### Bugs found and fixed during review/live run
- Cover URL not wrapped in `abs()` (would silently break relative CDN URLs)
- Search endpoint was `/api/v2/novels/search` — WW removed the `v2` prefix; updated to `/api/novels/search`
- `setup-live.ts`: `new Window()` with no base URL caused happy-dom to throw spurious `Invalid URL` on every `<link>` tag in live HTML; fixed with `{ url: "https://localhost/" }`
<!-- SECTION:FINAL_SUMMARY:END -->
