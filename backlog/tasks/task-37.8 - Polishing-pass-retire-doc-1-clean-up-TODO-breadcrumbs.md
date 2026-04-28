---
id: TASK-37.8
title: 'Polishing pass: retire doc-1, clean up TODO breadcrumbs'
status: Done
assignee: []
created_date: '2026-04-28 16:34'
updated_date: '2026-04-28 22:06'
labels: []
milestone: m-4
dependencies:
  - TASK-37.1
  - TASK-37.2
  - TASK-37.3
  - TASK-37.4
  - TASK-37.5
  - TASK-37.6
parent_task_id: TASK-37
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Final cleanup pass once all other TASK-37.x children have shipped. None of this is feature work — just removing scaffolding that was provisional during the rollout.

## Cleanup checklist

### Documentation

- **Delete `doc-1`** entirely. Per its own disclaimer: *"Working notes for the serial ingestion feature (Task-37). Delete when all adapters have shipped + the explore unification lands."* By the time this task runs, that's true. Anything in doc-1 that's still load-bearing should already have moved into in-code comments or a stable doc.
- **Update `doc-2`** (`Book import architecture — state & roadmap`) if it references serial-scrapers as "in flight" — flip to "shipped".

### TODO breadcrumbs

Grep the repo for these markers and clean them up:

```sh
rg -n "TASK-37\." apps/capacitor/src/
rg -n "TODO.*serial" apps/capacitor/src/
rg -n "// see doc-1" apps/capacitor/src/
rg -n "coming soon" apps/capacitor/src/pages/library/
```

Each match is either:
- A reference to a child ticket that's now closed → drop the comment.
- A "this lives in adapter X" pointer → still useful, keep.
- A "later we'll do Y" placeholder → either Y has shipped (drop) or is genuinely future work (convert to a real follow-up ticket).

Specific known places that need attention:

- `services/serial-scrapers/registry.ts` — comment about TASK-37.1 adding `opts.provider` should be gone (the option exists by then).
- `services/serial-scrapers/index.ts` — re-export list should be canonical.
- `pages/library/index.tsx` — any leftover `SerialSearchModal` import / state if anyone half-removed it.
- `pages/explore/web-novels-section.tsx` — the "switch to marquee when SCRAPERS.length >= 3" comment should either trigger (3 providers exist) or stay as a note.
- `App.tsx` — the `isSubPage` regex prefix list should match the routes that actually exist.

### Test fixture sanity

- `pnpm test:live` runs every provider's smoke. If the suite has crept past ~3 minutes, split into per-provider invocations (`pnpm test:live --project=ao3`) and document the split in the test config.
- Hand-built fixtures should be the smallest HTML that passes; if any have grown bloat during dev, trim.

### Surface cleanup

- `services/serial-scrapers/index.ts` — final canonical re-export list. Audit imports across the app for anything reaching into internal paths (`from "../../services/serial-scrapers/types"` etc.) and route them through the index.
- `services/serial-scrapers/labels.ts` — confirm `Record<ProviderId, string>` has no missing entries and no extras.
- `serialKeys` in `query-keys.ts` — drop any keys added during dev that no consumer uses.

### Known-issue migration

If any provider hit a known issue during impl (e.g. Royal Road's web-fallback IP block from TASK-37.3), it should already have a tracking ticket. Confirm those exist; create them now if not.

## Verification

1. `git grep -i "TASK-37\." apps/capacitor/src/` returns zero matches (all child-ticket pointers cleaned up).
2. `git grep -i "doc-1" apps/capacitor/src/` returns zero matches (doc deleted; in-code references replaced or dropped).
3. `pnpm check-types` + `pnpm test` + `pnpm test:live` all clean.
4. Manual scan of `services/serial-scrapers/` for staleness — file structure matches what's documented in the in-code header comments.
5. Close TASK-37 (umbrella) with a `finalSummary` that records what shipped end-to-end.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 doc-1 deleted from `backlog/docs/`
- [x] #2 doc-2 updated if it references serial-scrapers as in-flight
- [x] #3 All `TASK-37.*` and `// see doc-1` breadcrumbs in the codebase removed or converted to follow-up tickets
- [x] #4 Final canonical re-export list in `services/serial-scrapers/index.ts`
- [x] #5 `pnpm test:live` runtime under 3 minutes (or split per-provider documented)
- [x] #6 TASK-37 umbrella closed with `finalSummary`
- [x] #7 No internal-path imports — every consumer goes through the package barrel
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Polishing pass complete.

**Doc retirement.** doc-1 deleted from `backlog/docs/`; doc-2's "Web Novel / Serial Scraping" section flipped from a pointer-to-doc-1 to a "shipped" summary that names the in-code header comments as the canonical reference. TASK-37 and TASK-37.8 frontmatter `documentation:` pointers cleaned up.

**Codebase audit.** All checklist greps came back empty before any edits — `TASK-37.*`, `TODO.*serial`, `// see doc-1`, "coming soon" — so the breadcrumbs landed cleaned during the child-task work, not here. Verified the specific known places: `registry.ts` `opts.provider` doc is current (no stale TASK-37.1 reference), `App.tsx` `isSubPage` matches the live route table, `pages/library/index.tsx` has no `SerialSearchModal` leftovers, `web-novels-section.tsx` has no marquee TODO.

**Surface cleanup.** Audited all `serial-scrapers/` imports across the app — every consumer goes through the package barrel; zero internal-path imports. Dropped the unused `PROVIDER_LABEL` re-export from `index.ts` (only `providerLabel` is consumed externally; the `Record` itself stays module-private). All `serialKeys` (`all`, `list`, `counts`, `detail`, `entry`, `search`, `chapters`) have live consumers.

**Verification.**
- `pnpm check-types` (capacitor): 126 tests pass in 1.7s.
- `pnpm test:live`: 4/4 providers green in 11s wall (well under the 3-min cap). First run had a transient AO3 timeout; retry confirmed it was network flake, not a SELECTORS drift.
<!-- SECTION:FINAL_SUMMARY:END -->
