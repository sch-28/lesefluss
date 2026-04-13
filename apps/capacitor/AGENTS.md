# RSVP Capacitor Companion App

Ionic React mobile app (iOS/Android) for the ESP32 RSVP Reader. Manages books, syncs settings via BLE, and will provide a software RSVP reader.

For project overview, roadmap, and shared settings see `../../agents.md`.

## Tech Stack

- **Ionic React** + Capacitor 8
- **Drizzle ORM** + `@capacitor-community/sqlite` via `sqlite-proxy` adapter
- **`@tanstack/react-query`** v5 for data fetching / caching
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
    library/
      index.tsx           # Book grid, import FAB, long-press → action sheet, transfer progress modal
      book-card.tsx        # Individual book card (short tap → reader, long press → action sheet)
      transfer-modal/
    reader/
      index.tsx           # BookReader page — VList, scroll/tap/selection handlers, position sync, font size controls
      paragraph.tsx       # React.memo paragraph component — word spans, heading detection, highlight/selection rendering, utf8ByteLength()
      selection-toolbar.tsx   # Fixed toolbar shown during text selection (color swatches, note, cancel)
      highlight-modal.tsx     # Bottom-sheet modal for editing an existing highlight (color, note, delete)
      highlights-list-modal.tsx # Bottom-sheet listing all highlights for the book; tap to jump
    settings.tsx          # ESP32 settings UI + BLE sync/disconnect
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
    query-client.ts         # Singleton QueryClient (used by App.tsx + non-React callers)
    bookImport.ts           # File picker, TXT + EPUB parsing
    db/
      index.ts              # Barrel — initDb(), db, sqliteConnection
      adapter.ts            # Drizzle sqlite-proxy adapter + sanitizeParams
      migrations.ts         # Migration runner (reads drizzle/ journal + SQL files)
      web-setup.ts          # jeep-sqlite web bootstrap (no-op on native)
      schema.ts             # Drizzle table definitions
      queries/              # Raw async query functions (import as `queries` object)
        highlights.ts       # getHighlightsByBook, addHighlight, updateHighlight, deleteHighlight, deleteHighlightsByBook
      hooks/                # react-query wrappers (import as `queryHooks` object)
        query-keys.ts       # Centralised key factory (bookKeys, settingsKeys) — bookKeys.highlights(id)
        use-books.ts        # useBooks, useBook, useBookContent, useImportBook, useDeleteBook
        use-highlights.ts   # useHighlights, useAddHighlight, useUpdateHighlight, useDeleteHighlight
        use-settings.ts     # useSettings, useSaveSettings
        index.ts            # Barrel — exports `queryHooks` object + key factories
  utils/
    log.ts                  # Structured logger — use instead of console.* everywhere
drizzle/                    # Hand-written SQL migrations
```

## Logging (`src/utils/log.ts`)

All logging in the app must go through `log` — never use `console.*` directly.

```ts
import { log } from "../utils/log";

log("ble", "connected:", deviceId);           // → [RSVP][ble] connected: <id>
log.warn("booksync", "position mismatch");    // → [RSVP][booksync] position mismatch
log.error("db", "migration failed:", err);    // → [RSVP][db] migration failed: ...
```

The `[RSVP]` prefix makes it trivial to grep logcat output. The `pnpm android` script already filters logcat to `Capacitor/Console` — all `log()` output lands there.

## Database (`src/db/schema.ts`)

Five tables, Drizzle ORM with typed queries:

| Table | Purpose |
|-------|---------|
| `devices` | BLE device history (name, id, last connected) |
| `settings` | ESP32 settings with defaults |
| `books` | Metadata only (text id = 8-char hex PK, title, author, format, path, size, position, isActive, timestamps) |
| `book_content` | Large data separate (content text, cover image base64, chapters JSON) |
| `highlights` | Per-book text highlights — startOffset, endOffset (UTF-8 byte, word-start), color, note, timestamps |

- `DatabaseProvider` context wraps the app (`src/contexts/DatabaseContext.tsx`)
- Single clean migration in `drizzle/` — fresh DB, no incremental migrations
- `books.id` is a random 8-char hex string (generated at import), also used as `book.hash` on the ESP32 for identity verification
- `isActive` on `books`: boolean, at most one row true at a time — marks the book currently on the ESP32
- `books.size` is the **UTF-8 byte length** of the content string (`utf8ByteLength(content)`), not the JS `.length`. This matches the byte count the ESP32 uses for progress calculation.

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

- All IDs are `string` (8-char hex), not integers
- **`updateBook(id, data)`** — generic partial updater, accepts any subset of `Book` fields. Use this instead of raw SQL or adding single-field helpers. e.g. `updateBook("a1b2c3d4", { filePath })`, `updateBook("a1b2c3d4", { isActive: true })`, `updateBook("a1b2c3d4", { position: 1234, lastRead: Date.now() })`
- **`addBookWithContent(book, content, coverImage?, chapters?)`** — inserts into both `books` and `book_content` tables. `book.id` must be provided (generated by caller).
- **`deleteBook(id)`** — deletes from both tables (content first, then metadata). For full cleanup including disk files use `removeBook()` from `bookImport.ts`

## React Query (`src/services/db/hooks/`)

All DB reads and writes in React components go through `queryHooks`, not raw `queries.*` calls. Raw `queries.*` still exists for non-React code (services, contexts) and for high-frequency fire-and-forget writes (position saves in the reader).

### Usage pattern

```ts
import { queryHooks } from "../services/db/hooks";
import { bookKeys, settingsKeys } from "../services/db/hooks/query-keys";

// Reads
const { data, isPending }  = queryHooks.useBooks();       // { books, covers }
const { data: book }       = queryHooks.useBook(id);
const { data: content }    = queryHooks.useBookContent(id);
const { data: settings }   = queryHooks.useSettings();

// Writes (mutations — auto-invalidate the relevant queries)
const importBook  = queryHooks.useImportBook();
importBook.mutate({ onProgress: (pct) => setProgress(pct) });

const deleteBook  = queryHooks.useDeleteBook();
deleteBook.mutate(book);

const save = queryHooks.useSaveSettings();
save.mutate({ wpm: 400 });
```

### Key conventions

- **`staleTime: Infinity`** globally — SQLite is local; data only changes when we write. No background refetching.
- **Mutations handle invalidation** — every `useMutation` has an `onSuccess` that invalidates the right keys. Callers don't need to think about it.
- **Key hierarchy** — `bookKeys.all = ['books']` is a prefix of `bookKeys.detail(id) = ['books', id]`, so invalidating `bookKeys.all` cascades to all detail/content queries.
- **Position saves in the Reader** use raw `queries.updateBook()` directly — they're fire-and-forget, high-frequency writes that don't benefit from mutation wrappers.
- **Non-React callers** (BLE contexts, bookImport.ts) use raw `queries.*` for writes. If they need the UI to refresh, they can import `queryClient` from `services/query-client.ts` and call `queryClient.invalidateQueries()`.
- **`useIonViewWillEnter`** in Library calls `qc.invalidateQueries({ queryKey: bookKeys.all })` to refresh when navigating back from the reader.
- **Settings page** uses a local `draft` state seeded from `useSettings()` — the user edits the draft, then saves it with `useSaveSettings()`.

## Book Reader (`src/pages/reader/`)

Full-screen virtualized scroll reader split across three files:
- `index.tsx` — page shell, data loading, scroll/tap/selection handlers, position sync, progress bar, TOC/highlights modals, theme
- `paragraph.tsx` — `React.memo` component for a single paragraph; word spans, heading detection, highlight/selection rendering
- `selection-toolbar.tsx` — fixed-position toolbar shown during text selection; color swatches, note button, cancel
- `highlight-modal.tsx` — bottom-sheet for editing an existing highlight (color, note, delete); auto-saves on change
- `highlights-list-modal.tsx` — bottom-sheet listing all book highlights ordered by position; tap to jump
- `dictionary-modal.tsx` — bottom-sheet modal fetching definitions from the Free Dictionary API via react-query

Uses `virtua`'s `VList` for virtualisation (~20–30 paragraphs in the DOM at any time regardless of book size).

### Position = UTF-8 byte offset

All positions are **UTF-8 byte offsets** into the content string — the same number the ESP32 stores in `position.txt` and reports over BLE. This is critical: use `utf8ByteLength()` (exported from `Paragraph.tsx`, wraps `TextEncoder`) everywhere offsets are calculated. Never use JS `.length`, which counts UTF-16 code units and diverges for any non-ASCII character (smart quotes, em-dashes, accented letters, etc.).

### Data model (lean — ~37KB overhead for a 1.4MB book)

Computed once in `useMemo([content])` in `index.tsx`:

```ts
paragraphs: string[]       // content.split("\n\n") — needed for VList item count
paragraphOffsets: number[] // UTF-8 byte offset where each paragraph starts in content
chapters: Chapter[]        // parsed from contentRow.chapters JSON; empty for TXT books
```

Per-paragraph word offsets are computed at render time inside `<Paragraph>` using `utf8ByteLength()`. Only ~20–30 paragraphs are mounted at any time, so this is negligible work.

### Runtime operations

| Operation | How | Cost |
|-----------|-----|------|
| Scroll end → save position | DOM span query for top-left visible word | O(n) visible spans |
| Open → scroll to position | Binary search `paragraphOffsets` for `book.position` | O(log p) |
| Word tap → save position | `tokenOffset` passed via `onWordTap` callback | O(1) |
| Highlight active word | `tokenOffset === activeOffset` during render | O(1) per span |
| Progress bar scrub | Binary search `paragraphOffsets` for target byte → `scrollToIndex` | O(log p) |
| Chapter jump | Binary search `paragraphOffsets` for `chapter.startByte` → `scrollToIndex` | O(log p) |

### Key patterns

- **`VListHandle`** via `useRef<VListHandle>` — exposes `findItemIndex`, `scrollToIndex`, `getItemOffset`, `getItemSize`, `cache`
- **`CacheSnapshot`** stored in a module-level `Map<bookId, CacheSnapshot>` on unmount; restored via `cache` prop on mount — pixel-accurate scroll restoration without DB storage
- **`onScrollEnd`** fires position save (no debounce timer needed — virtua calls it once after the scroll settles)
- **`onScroll`** also calls `findItemIndex(scrollOffset)` to update `progressOffset` live during scrolling
- **Two offset states:** `activeOffset` (word highlight, set to `-1` while scrolling) and `progressOffset` (progress bar, updated every scroll frame via `findItemIndex`)
- **Word tap — two-stage:** first tap highlights the word and saves position; second tap on the already-highlighted word opens the dictionary modal
- **Heading paragraphs** (prefixed `# `) are not tappable; `handleScrollEnd` skips them when finding the top word
- **Routing** — `/reader/:id` is placed outside `IonTabs` in `App.tsx` so the tab bar is not rendered

### Reading themes

Two themes stored in `localStorage` under `reader_theme`:
- **`dark`** (default) — `#1a1a1a` background, `#e4e4e4` text — actual dark mode
- **`light`** — `#ffffff` background, `#111111` text

Applied as a `reader-theme-{name}` class on `IonPage`. CSS custom properties scope all colours (background, text, toolbar, progress bar) to each theme. Only affects the reader — Library and Settings stay monochrome.

Sun icon = tap to switch to light; moon icon = tap to switch to dark.

### Progress bar

Fixed bar at the bottom of `IonContent`, positioned `calc(env(safe-area-inset-bottom) + 8px)` above the screen edge to stay clear of the iOS swipe-home gesture zone. Tap or drag (pointer capture) anywhere on the track to scrub to that position. Updates live during scrolling via `progressOffset`.

### TOC / Chapter navigation

`listOutline` toolbar button — only rendered when `chapters.length > 0` (EPUB imports only; TXT has no chapters). Opens a sheet modal (`breakpoints=[0, 0.5, 0.9]`) listing all chapters. Tapping a chapter binary-searches `paragraphOffsets` for its `startByte`, scrolls there, saves the position, and closes the modal.

### Highlights & annotations

Long-press any word to enter selection mode. Two fixed handles (start/end) appear that can be dragged to extend the range — same UX as Kindle/Apple Books. A toolbar appears above the selection with 4 color swatches and a note button. Picking a color auto-saves the highlight immediately; the toolbar stays open for further adjustments. The X closes the toolbar without deleting the saved highlight.

Long-pressing a word that is already highlighted opens the **HighlightModal** to edit color/note or delete. Tapping the bookmark icon in the toolbar opens the **HighlightsListModal** showing all highlights for the book ordered by position; tapping a row jumps there.

- Offsets stored as UTF-8 byte word-start offsets (same as `data-offset` on word spans)
- Overlapping highlights allowed; most-recently-created color wins visually
- Deleting a book cascades to its highlights (`deleteHighlightsByBook` called in `deleteBook`)
- `highlightsByParagraph: Map<index, HighlightRange[]>` memoized in the reader so each `<Paragraph>` receives only its slice with no scroll-time overhead
- Scroll suppressed during selection via `touch-action: none` on the VList container

### Dictionary lookup

Tap an already-highlighted word → opens a bottom-sheet modal with the definition from `api.dictionaryapi.dev` (free, no API key). Results cached permanently by react-query (`staleTime: Infinity`). Shows phonetic, part of speech, up to 3 definitions + examples. Handles not-found and network errors gracefully.

### Library interaction model (`BookCard.tsx`)

- **Short tap** (< 400ms) → `history.push('/reader/:id')`
- **Long press** (≥ 400ms) → action sheet (Set active on device / Delete)
- `onTouchMove` cancels the long-press timer so grid scrolling never accidentally triggers the action sheet

## UI

- **2 tabs:** Library (default) + Settings
- BLE status badge between tabs (no dedicated connection page)
- **Library:** book grid (3 cols), cover art, progress bar, "On device" badge; empty state; FAB to import; short tap → reader; long press → action sheet ("Set active on device" / "Delete"); transfer progress modal
- **Settings:** sliders for WPM/delays/acceleration/offsets, toggles for inverse/BLE, sync-to/from-device buttons, disconnect
- **BookReader:** full-screen virtualized reader, word highlight, back button, dark/light theme toggle, progress bar, TOC navigation, dictionary lookup; position syncs bidirectionally with ESP32

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
| In-app scroll reader (BookReader + virtua VList) | Done |
| Reader progress bar (tap/drag scrub, live scroll update) | Done |
| Chapter / TOC navigation modal (EPUB books) | Done |
| Reading themes (dark / light, localStorage) | Done |
| Dictionary lookup (tap highlighted word, Free Dictionary API) | Done |
| Highlights & annotations (long-press select, color, notes, per-book, handles UI) | Done |
