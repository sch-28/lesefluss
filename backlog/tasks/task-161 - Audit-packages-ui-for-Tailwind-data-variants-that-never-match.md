---
id: TASK-161
title: Audit packages/ui for Tailwind data-* variants that never match
status: To Do
assignee: []
created_date: '2026-07-28 22:29'
updated_date: '2026-07-28 22:29'
labels: []
dependencies: []
documentation:
  - STATS-IMPROVEMENTS.md
priority: medium
ordinal: 72000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Several components in `packages/ui` style Radix state with bare Tailwind data variants (`data-active:`, `data-horizontal:`, `data-open:`, `has-data-checked:`). Tailwind v4 compiles those to valueless attribute selectors like `[data-active]`, while Radix emits `data-state="active"`, `data-orientation="horizontal"` and so on. The rules are therefore dead CSS: they compile, they ship, and they never apply. Nothing fails, which is why these survive.

Three were fixed while working on the reading stats page (TASK-159.2): `tabs.tsx` had no active-tab styling at all, `separator.tsx` had neither width nor height and was invisible everywhere it was used, and `field.tsx` had a dead description rule.

Two known remaining, found in review:

- `dropdown-menu.tsx:35,204,223` — `data-open:` / `data-closed:` against Radix's `data-state="open"|"closed"`. Open and close animation (`data-open:animate-in`, `zoom-in-95`, `fade-out-0`) never runs, and the sub-trigger's `data-open:bg-accent` highlight never shows. Line 35 already mixes in a working `data-[state=closed]:overflow-hidden`, which is the tell.
- `field.tsx:99` — `has-data-checked:` and `dark:has-data-checked:` compile to `:has(*[data-checked])`, but Radix emits `data-state="checked"`, so the selected-card styling on a `FieldLabel` wrapping a radio or switch is dead.

Sweep the package for the rest rather than fixing only these two. Note that `data-disabled:`, `data-highlighted:` and `data-inset:` are genuine valueless attributes and are correct as written, so this is not a blanket find-and-replace.

**Verify in built CSS, not in source.** This class of bug is invisible in the source: the class names look plausible and TypeScript has no opinion. Build the app and grep the stylesheet for the stale selector shapes. Minified CSS drops the attribute quotes, so search for `[data-state=active]`, not `[data-state="active"]`.

**Check specificity at every call site before assuming a fix is free.** Making a dead variant live can lose a fight it never previously entered: `group-data-[orientation=horizontal]/tabs:h-8` (0,2,0) beat a call site's `h-auto` (0,1,0) and would have collapsed the docs sidebar to 32px. tailwind-merge does not dedupe classes with different modifier prefixes, so both survive into the DOM.

Also note `has-` matches descendants, not the element itself: `group-has-data-[orientation=horizontal]/field:` was still dead after a first rename because the attribute sits on the group element.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every Radix-backed data variant in packages/ui either matches an attribute the primitive actually emits, or is deleted
- [ ] #2 Dropdown menus animate on open and close, and the sub-trigger highlights while open
- [ ] #3 A FieldLabel wrapping a checked radio or switch shows its selected styling
- [ ] #4 Verification is done against built CSS, searching the unquoted minified selector forms
- [ ] #5 Each call site of a newly-live variant is checked for specificity conflicts with its own overrides
<!-- AC:END -->
