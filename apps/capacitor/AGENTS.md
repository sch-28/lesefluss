# RSVP Capacitor Companion App

Ionic React mobile app (iOS/Android) for the ESP32 RSVP Reader. Manages books, syncs settings via BLE, and will provide a software RSVP reader.

For project overview, roadmap, and shared settings see `../../agents.md`.

## Tech Stack

- **Ionic React** + Capacitor 8
- **Drizzle ORM** + `op-sqlite` (SQLite)
- **`@capacitor-community/bluetooth-le`** for BLE
- **Vite** + TypeScript
- Monochrome Ionic theme

## Development

```bash
pnpm install
pnpm start          # Vite dev server, hot reload at http://localhost:3000
pnpm check          # Type checking
pnpm build          # Production build
pnpm preview        # Preview production build
```

## File Structure

```
src/
  pages/
    Library.tsx             # Book list, import FAB, swipe-to-delete
    Settings.tsx            # ESP32 settings UI + BLE sync/disconnect
  contexts/
    DatabaseContext.tsx      # Drizzle DB provider
    BLEContext.tsx           # App-wide BLE connection state
  services/
    ble.ts                  # Scan, connect, read/write characteristics
    bookImport.ts           # File picker, TXT + EPUB parsing
  db/
    schema.ts               # Drizzle table definitions
    queries/                # Typed query helpers
  constants/
    ble.ts                  # Service + characteristic UUIDs
drizzle/                    # Hand-written SQL migrations
```

## Database (`src/db/schema.ts`)

Four tables, Drizzle ORM with typed queries:

| Table | Purpose |
|-------|---------|
| `devices` | BLE device history (name, id, last connected) |
| `settings` | ESP32 settings with defaults |
| `books` | Metadata only (title, author, format, path, size, position, isActive, timestamps) |
| `book_content` | Large data separate (content text, cover image base64, chapters JSON) |

- `DatabaseProvider` context wraps the app (`src/contexts/DatabaseContext.tsx`)
- Migrations in `drizzle/` use table-recreation pattern (SQLite ALTER TABLE compat)
- `isActive` on `books`: boolean, at most one row true at a time — marks the book currently on the ESP32

## BLE

**Service:** `src/services/ble.ts` — scan, connect, read/write characteristics
**Context:** `src/contexts/BLEContext.tsx` — app-wide connection state, auto-reconnect
**UUIDs:** `src/constants/ble.ts` (shared via `@rsvp/ble-config` workspace package)

- Scans for "RSVP-Reader", auto-stops after 30s
- Reads/writes settings as JSON to settings characteristic
- Saves last connected device to SQLite
- Connection state tracking, RSSI display, error toasts
- BLE status badge (bluetooth icon) between the two tab bar tabs

## Book Import (`src/services/bookImport.ts`)

- File picker via `@capawesome/capacitor-file-picker`
- **TXT:** read directly, store as plain text in `book_content`
- **EPUB:** parsed with `epubjs` — extracts plain text, cover image (base64), chapter boundaries
- Original `.epub` saved to `Directory.Data/books/{id}.epub` via `@capacitor/filesystem`
- `removeBook()` cleans up both DB rows and disk files
- Import shows progress bar for EPUB parsing

### epubjs quirks (types are incomplete/wrong)

- `spine.length` exists at runtime but is not in the type definitions — cast needed
- `section.load()` returns `Promise<Element>` at runtime but types say `Document` — cast needed
- `spine.items` exists at runtime but is not typed — use `spine.each()` (typed) to iterate sections or `spine.get(i)` for indexed access
- `book.loaded.cover` resolves to `string | undefined` at runtime despite types saying `Promise<string>`
- `book.archive` can be `undefined` at runtime despite types saying `Archive` — guard before use
- `PackagingMetadataObject` types are correct: use `.creator` (not `.author`) for the author field

## Database queries (`src/db/queries/books.ts`)

- **`updateBook(id, data)`** — generic partial updater, accepts any subset of `Book` fields. Use this instead of raw SQL or adding single-field helpers. e.g. `updateBook(id, { filePath })`, `updateBook(id, { isActive: true })`, `updateBook(id, { position: 1234, lastRead: Date.now() })`
- **`addBookWithContent(meta, content, coverImage?, chapters?)`** — inserts into both `books` and `book_content` tables
- **`deleteBook(id)`** — deletes from both tables (content first, then metadata). For full cleanup including disk files use `removeBook()` from `bookImport.ts`

## UI

- **2 tabs:** Library (default) + Settings
- BLE status badge between tabs (no dedicated connection page)
- **Library:** book list with progress bar, "On device" badge for active book, last-read date; empty state; swipe-to-delete; FAB to import; tap book → action sheet with "Set active on device" (enabled when BLE connected) + "Delete"
- **Settings:** sliders for WPM/delays/acceleration/offsets, toggles for inverse/BLE, sync-to/from-device buttons, disconnect

## What's Done

| Feature | Status |
|---------|--------|
| Settings UI (all ESP32 options) | Done |
| SQLite database (4 tables) | Done |
| BLE scan + connect + bidirectional sync | Done |
| Book import (TXT + EPUB) | Done |
| Book library UI (list, delete, progress) | Done |
