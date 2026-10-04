---
id: TASK-161
title: Audit packages/ui for Tailwind data-* variants that never match
status: Done
assignee: []
created_date: '2026-07-28 22:29'
updated_date: '2026-10-03 23:20'
labels: []
milestone: m-13
dependencies: []
documentation:
  - STATS-IMPROVEMENTS.md
modified_files:
  - packages/ui/src/components/dropdown-menu.tsx
  - packages/ui/src/components/field.tsx
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
- [x] #1 Every Radix-backed data variant in packages/ui either matches an attribute the primitive actually emits, or is deleted
- [x] #2 Dropdown menus animate on open and close, and the sub-trigger highlights while open
- [x] #3 A FieldLabel wrapping a checked radio or switch shows its selected styling
- [x] #4 Verification is done against built CSS, searching the unquoted minified selector forms
- [x] #5 Each call site of a newly-live variant is checked for specificity conflicts with its own overrides
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implementation notes (agent)

Sweep: grepped every `data-*` / `group-data-*` / `has-data-*` / `peer-data-*` variant in packages/ui/src/components. Bare (valueless) Radix variants existed only in dropdown-menu.tsx and field.tsx. Emitted attributes confirmed in installed dist (node_modules/.pnpm/@radix-ui+react-*/dist/index.mjs): menu Content/SubContent + SubTrigger `data-state=open|closed` (getOpenState), items `data-highlighted=""`/`data-disabled=""`, checkbox/radio items `data-state=checked|unchecked`; popper wrapper inner div `data-side`/`data-align`; switch + radio-group item/indicator/thumb `data-state=checked|unchecked`; tabs trigger `data-state=active|inactive`, root/list `data-orientation`; toggle `data-state=on|off`; select content `data-state=open|closed`, trigger `data-placeholder=""`, item `data-disabled=""`; slider root `data-disabled=""`; accordion/collapsible/dialog `data-state=open|closed`; separator `data-orientation`; vaul content `data-vaul-drawer-direction`.

Changed:
- dropdown-menu.tsx:35 (DropdownMenuContent) `data-open:{fade-in-0,zoom-in-95,animate-in}` -> `data-[state=open]:...`; `data-closed:{fade-out-0,zoom-out-95,animate-out}` -> `data-[state=closed]:...`
- dropdown-menu.tsx:204 (DropdownMenuSubTrigger) `data-open:bg-accent`, `data-open:text-accent-foreground` -> `data-[state=open]:...`
- dropdown-menu.tsx:223 (DropdownMenuSubContent) same open/closed rename as :35
- field.tsx:99 (FieldLabel) `has-data-checked:{border-primary/30,bg-primary/5}`, `dark:has-data-checked:{border-primary/20,bg-primary/10}` -> `has-data-[state=checked]:...`

Left as-is (correct): data-disabled:, data-highlighted (unused), data-inset: (own attr), data-[placeholder], data-[disabled] (select/slider), all data-[state=...] in sheet/dialog/alert-dialog/popover/select/drawer/accordion/switch/toggle/tabs, data-[side=...], separator/tabs data-[orientation=...], vaul direction variants, own attrs data-[variant]/data-[size]/data-[slot].
Not Radix-backed, untouched but noted: label.tsx `group-data-[disabled=true]:` and field.tsx `group-data-[disabled=true]/field:` rely on consumer-set `data-disabled="true"`; field.tsx FieldSeparator `group-data-[variant=outline]/field-group:` and FieldGroup `data-[slot=checkbox-group]:gap-3` never match anything in this repo (shadcn upstream leftovers).

Call sites checked for specificity:
- apps/capacitor/src/pages/explore/filter-row.tsx:89 DropdownMenuContent `max-h-80 min-w-48 overflow-y-auto`: no overlap with newly-live animation props. OK.
- apps/capacitor/src/pages/reader/index.tsx:1745 DropdownMenuContent `w-56`: OK.
- apps/web/src/components/header.tsx:65 DropdownMenuContent `w-52`: OK.
- DropdownMenuSubTrigger / SubContent: no call sites.
- FieldLabel apps/web/src/routes/login/index.tsx:59 and apps/web/src/routes/_authenticated/account/index.tsx:36: text-only children, no checked descendant, no border/bg overrides. OK.
No app call-site changes needed.

Verification (apps/capacitor vite build into scratch dir, `--minify esbuild` since config has minify:false): `[data-open]` 0, `[data-closed]` 0, `[data-checked]` 0, `:has([data-checked])` 0, `[data-active]` 0, `[data-horizontal]` 0, `[data-vertical]` 0; `[data-state=open]` 17, `[data-state=closed]` 15, `[data-state=checked]` 10, `:has([data-state=checked])` 8. Present: `.data-\[state\=open\]\:animate-in[data-state=open]`, `...:bg-accent[data-state=open]`, `.has-data-\[state\=checked\]\:border-primary\/30:has([data-state=checked])`. packages/ui + apps/web tsc clean; capacitor vitest 905/905; capacitor tsc errors only in reader/index.tsx + hyphenation-lang.ts (another agent's in-flight edit). biome clean on both files.

AC2/AC3 left for lead: CSS now matches emitted attributes, but open/close animation and FieldLabel selected state were not visually checked at runtime (no FieldLabel-wrapped radio/switch call site exists today).

Runtime check 2026-10-04 (Playwright, dev build): opening the reader's More actions menu runs the `enter` CSS animation on the menu content and Escape runs `exit` (Element.getAnimations). Sub-trigger highlight has no call site; its rule compiles to `[data-state=open]` like the content's, verified in built CSS earlier. FieldLabel: no app call site wraps a radio or switch, so the class list was applied to a label around an element with data-state=checked vs unchecked: checked gets the primary-tinted background and border, unchecked stays transparent with the default border.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Dead Tailwind data variants in packages/ui fixed: dropdown menu open/close animations and sub-trigger highlight now key on Radix's data-state, and FieldLabel's selected styling on has-data-[state=checked]. Verified in built CSS and at runtime.
<!-- SECTION:FINAL_SUMMARY:END -->
