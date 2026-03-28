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
    Library.tsx             # Book grid, import FAB, tap → action sheet, transfer progress modal
    Settings.tsx            # ESP32 settings UI + BLE sync/disconnect
  contexts/
    DatabaseContext.tsx     # Drizzle DB provider
    BLEContext.tsx          # App-wide BLE connection state + onConnected hook
    BookSyncContext.tsx     # Active-book tracking, position sync, book transfer
  ble/
    index.ts                # Public surface — exports `ble`, `bleClient`, types
    types.ts                # BLEConnectionState, BLEResult, BLE_CONNECTION_TIMEOUT_MS
    client.ts               # BLEClient class (scan/connect/disconnect), `bleClient` singleton
    characteristics/
      index.ts              # `ble` object — single import for all characteristic ops
      settings.ts           # ble.readSettings(), ble.writeSettings()
      position.ts           # ble.readPosition(), ble.writePosition()
      transfer.ts           # ble.transferBook() — START/CHUNK/END state machine
      storage.ts            # ble.readStorage() — flash storage info {free_bytes, total_bytes}
    utils/
      encoding.ts           # dataViewToString, stringToDataView, chunkString
  services/
    bookImport.ts           # File picker, TXT + EPUB parsing
  db/
    schema.ts               # Drizzle table definitions
    queries/                # Typed query helpers (import as `queries` object)
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

**Client:** `src/ble/client.ts` — `BLEClient` class, exported as `bleClient` singleton (scan, connect, disconnect, state)
**Characteristics:** `src/ble/characteristics/` — pure functions grouped under the `ble` object
**Context:** `src/contexts/BLEContext.tsx` — app-wide connection state, auto-scan/connect, `onConnected` hook
**Book sync:** `src/contexts/BookSyncContext.tsx` — active book, position sync, file transfer
**UUIDs:** imported directly from `@rsvp/ble-config` workspace package (no local constants file)

Usage pattern:
```ts
import { ble, bleClient, BLEConnectionState } from "../ble";

await ble.readSettings();
await ble.writePosition(1234);
await ble.transferBook(content, "book.txt", onProgress);
```

- Scans for "RSVP-Reader", auto-connects when exactly 1 device found
- On connect: position sync runs automatically (device vs app — furthest wins)
- Saves last connected device to SQLite
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
- **Library:** book grid (3 cols), cover art, progress bar, "On device" badge; empty state; FAB to import; tap book → action sheet ("Set active on device" / "Delete"); transfer progress modal
- **Settings:** sliders for WPM/delays/acceleration/offsets, toggles for inverse/BLE, sync-to/from-device buttons, disconnect

## What's Done

| Feature | Status |
|---------|--------|
| Settings UI (all ESP32 options) | Done |
| SQLite database (4 tables) | Done |
| BLE scan + connect + bidirectional settings sync | Done |
| Book import (TXT + EPUB) | Done |
| Book library UI (grid, covers, progress, "On device" badge) | Done |
| BLE layer refactor (bleClient + ble characteristics object) | Done |
| BookSyncContext (position sync, book transfer) | Done |
| Library "Set active on device" + transfer progress modal | Done |
| Storage info display in Settings (free/total flash) | Done |
