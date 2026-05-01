---
id: TASK-54
title: Glossary (per-book entries)
status: Done
assignee: []
created_date: '2026-04-26 15:59'
updated_date: '2026-04-26 23:03'
labels: []
milestone: m-5
dependencies: []
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per-book glossary so the reader can keep track of recurring names — characters, places, things, concepts — anything worth remembering across a long book.

## Motivation

Long books often introduce many recurring entities (people, places, factions). Re-encountering one and not remembering who/what it is breaks the reading flow. A lightweight, free-form glossary attached to each book lets the reader jot a quick note and surface it again later, without leaving the reader.

## MVP scope

**Entry model**
- Free-form entries per book: `label`, `notes`, `color` (auto-derived from label hash, user-overridable later).
- Auto-generated avatar from label: HSL color + first-letters initials. Used in glossary list and entry card. Not shown inline in the text.
- No type field for now (Character/Place/Thing) — colors are enough differentiation. Revisit only if free-form proves messy.

**Adding entries**
- Selection toolbar (`selection-toolbar.tsx`): new "add to glossary" action. Pre-fills label with the selected text. Opens a small form for label + notes.
- Manual add from the glossary list.

**Reader integration**
- Merge TOC + Highlights + Glossary into a single annotations sheet behind one toolbar icon. Use `IonSegment` (Contents / Highlights / Glossary) at the top of the sheet. Empty segments hidden (e.g. TXT books skip Contents).
- Inline rendering in `paragraph.tsx`: subtle colored underline (or left-border tint) on words matching an entry label. Use the same `O(1)`-per-span pattern as highlights, with a memoized `glossaryByParagraph` map.
- Toggle in the appearance popover: "Show glossary highlights" (default on, persisted in `localStorage`).
- Tap an underlined word → opens the entry card.
- Entry card: avatar, label, notes, "Jump to first mention" + "Jump to next mention from current scroll position".

**Storage & sync**
- New `glossary_entries` table in capacitor SQLite (Drizzle migration). Columns: `id`, `bookId`, `label`, `notes`, `color`, `createdAt`, `updatedAt`.
- Mirror table in web Postgres schema (`apps/web/src/db/schema.ts` + migration).
- Add to `@lesefluss/core` Zod schema. Full-snapshot sync, last-write-wins by `updatedAt`, tombstones on delete (mirror highlights).
- Auto-push via `scheduleSyncPush()` on every mutation hook (mirror highlights pattern).
- Cascade delete with the parent book (same as `deleteHighlightsByBook`).

**Profile page (web)**
- Surface glossary entries on the per-book section of `/profile`, alongside highlights.

## Out of scope / future tickets

Capture but do not build now:

- **Aliases per entry** — one entry matched against many surface forms (Lizzy / Elizabeth / Miss Bennet). Adds a `glossary_aliases` table.
- **Cross-references in notes** — `@entry-name` syntax in the notes field rendered as tappable chips.
- **Auto-suggest entries** — on-demand action in the Glossary tab that runs a capitalized-name frequency heuristic and offers candidates to confirm.
- **Custom avatar images** — broken out as its own ticket.
- **Optional type tags** (Character / Place / Thing / Concept) — only if the free-form model proves messy in practice.
- **Cross-book / series-wide glossary** — shared universes. Sync-schema implications, much later.

## Naming

- Feature: **Glossary**
- Each item: **entry**
- Action verb: "Add to glossary"
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 New `glossary_entries` table exists in capacitor SQLite (Drizzle migration `0015_glossary` registered in `_journal.json`) with columns id, bookId (nullable), label, notes, color, createdAt, updatedAt
- [x] #2 Mirror `sync_glossary_entries` table + migration `0003_glossary` added to `apps/web/src/db/schema.ts`
- [x] #3 Glossary entries are part of full-snapshot cloud sync (`SyncGlossaryEntrySchema` in `@lesefluss/core`, last-write-wins, tombstones on delete) and auto-push via `scheduleSyncPush()` on every mutation
- [x] #4 Selection toolbar gains an 'Add to glossary' action that pre-fills the label with the selected text; if a matching label already exists, opens that entry instead of creating a duplicate
- [x] #5 Reader toolbar exposes a single 'annotations' icon (bookmarksOutline) that opens a sheet with `IonSegment` tabs: Contents / Highlights / Glossary; empty segments are hidden; existing TOC + bookmark icons removed
- [x] #6 Glossary tab lists entries with auto-generated avatar (HSL color + initials derived from label), grouped into 'This book' and 'Global' sections; floating + button bottom-right adds a new entry
- [x] #7 Entry card shows avatar, tap-to-edit label, scope toggle ('Available in all books'), 6-color palette + auto, notes, first-mention preview blockquote, 'Jump to first mention', 'Jump to next mention from current position', and delete action
- [x] #8 Words in the reader matching an entry label are rendered with a subtle colored underline (entry color, via `--glossary-color` CSS var); tap opens the entry card; works in both ScrollView and PageView
- [x] #9 Appearance popover has a 'Glossary highlights' toggle backed by the new synced setting `readerGlossaryUnderline` (DB-backed, syncs across devices — not localStorage)
- [x] #10 Deleting a book cascades to its book-scoped glossary entries; global entries (bookId IS NULL) survive book deletion
- [x] #11 Per-book section of `/profile` on the website surfaces glossary entries grouped by book + a Global group, with stats card showing the glossary count
- [x] #12 Glossary entries support a `global` scope toggle: `bookId` is nullable, NULL = global (matches in every book, survives book deletion), non-null = book-scoped. Schema, sync, cascade, and inline rendering all honor this.
- [x] #13 Glossary tab uses a sectioned list ('This book' / 'Global' headers via `IonItemDivider sticky`) instead of filter pills — visually lighter; the per-row 'Global' pill was redundant once sections convey scope and was removed.
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Glossary feature shipped

Per-book + global glossary with full cloud sync, inline reader highlights, merged annotations sheet, and web profile surface.

### Data + sync
- Capacitor SQLite: `glossary_entries` table (`bookId` nullable), migrations `0015_glossary` and `0016_reader_glossary_underline`.
- Postgres: `sync_glossary_entries` table with composite PK (userId, entryId), migrations `0003_glossary` and `0004_reader_glossary_underline`.
- `SyncGlossaryEntrySchema` in `@lesefluss/core`; full-snapshot pull/push with sticky tombstones on the server side; auto-push debounced 2s on every mutation.
- Cascade in `deleteBook` + `hardDeleteBook` only deletes book-scoped entries; globals survive.

### Reader UI
- One `bookmarksOutline` toolbar icon replaces TOC + bookmark; opens **AnnotationsSheet** with `IonSegment` Contents / Highlights / Glossary; empty segments hidden, single-toolbar header with `ion-no-border` for visual lightness.
- Glossary tab: sectioned list (This book / Global), floating + FAB bottom-right with safe-area inset.
- **GlossaryEntryModal**: tap-to-edit label (avoids keyboard pop), auto-derived avatar, scope toggle, 6-color palette + auto, notes, first-mention preview blockquote with themed `<mark>`, jump first/next (disabled when no mention found), delete.
- Inline underlines via `paragraph.tsx` + `useGlossaryDecorations` hook (single alternation regex, char→byte conversion, multi-entry-per-label aggregation). Tap a glossary word → entry card.
- Selection toolbar gains 'Add to glossary' — dedupes against existing entries by case-insensitive label match.
- Appearance popover: `readerGlossaryUnderline` synced setting toggle.

### Web profile
- `getProfileStats` returns `glossaryCount` + `glossaryEntries` (LEFT JOIN to books for global support).
- New Glossary section on `/profile`; `clearCloudData` purges glossary too.

### Files added
- `apps/capacitor/src/services/db/queries/glossary.ts`
- `apps/capacitor/src/services/db/hooks/use-glossary.ts`
- `apps/capacitor/src/pages/reader/annotations-sheet.tsx`
- `apps/capacitor/src/pages/reader/glossary-entry-modal.tsx`
- `apps/capacitor/src/pages/reader/glossary-avatar.tsx`
- `apps/capacitor/src/pages/reader/glossary-utils.ts`
- `apps/capacitor/src/pages/reader/use-glossary-decorations.ts`
- 4 migration SQL files (capacitor 0015/0016, web 0003/0004)

### Follow-up tickets created
- TASK-99 (Custom avatar images) — depends on this.

### Deviations from plan
- Plan said "localStorage" for the show-glossary toggle; shipped as a proper synced setting following the AGENTS.md "Adding a New Setting" recipe (correct decision — agreed mid-implementation).
- Plan said filter pills (All / This book / Global) for the Glossary tab; shipped as a sectioned list with `IonItemDivider sticky` headers — visually lighter, no interactive cost, redundant per-row "Global" pill removed.
- Added `getMentionContext` + first-mention preview blockquote in the entry card (not in original plan — small addition asked for during implementation).
<!-- SECTION:FINAL_SUMMARY:END -->
