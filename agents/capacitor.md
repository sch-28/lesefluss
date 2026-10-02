# Lesefluss Capacitor Companion App

Ionic React mobile app (iOS/Android/Web) for the ESP32 Lesefluss reader. Manages books, syncs settings via BLE, and provides a software RSVP reader. Also runs as an embedded web app inside the TanStack Start website at `/app`.

For project overview, roadmap, and shared settings see `../AGENTS.md`.

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
pnpm start          # Vite dev server, hot reload at http://localhost:3001
pnpm check          # Type checking
pnpm build          # Production build (native)
```

## Web Embed Build

The app can be built for embedding inside the website at `/app`:

```bash
WEB_BUILD=1 VITE_SYNC_URL="" VITE_WEB_BUILD=true pnpm build
# Or from the web app: pnpm build:app
```

**`VITE_WEB_BUILD=true`** enables:
- Vite `base: "/app/"` - all asset paths prefixed
- React Router basename `/app` - client routes become `/app/tabs/library` etc.
- Cookie-based auth instead of Bearer token (same-domain session)
- WASM path set to `/app/assets` for jeep-sqlite
- BLE/device UI hidden, file import uses HTML5 File API

Platform detection: `Capacitor.getPlatform() === "web"` (used throughout for BLE guards, UI hiding). Web build detection: `import.meta.env.VITE_WEB_BUILD === "true"` (used for auth and sync differences).

On the web, the SQLite database lives in IndexedDB through jeep-sqlite, which rewrites the whole entry after every write. `patches/jeep-sqlite@2.8.0.patch` makes that rewrite a single put: unpatched, it deleted the entry first, so leaving the page mid-save lost the whole local database (TASK-175.6). Keep the patch until upstream saves with one put; `e2e-app/local-store-unload.spec.ts` guards it.

## E2E tests

- **`pnpm e2e`** (`playwright.config.ts`, `e2e/`): the dev server at `/`, no backend.
- **`pnpm e2e:app`** (`playwright.app.config.ts`, `e2e-app/`): the web build as users get it at `/app`, against the production `apps/web` server on port 3417.
  - `e2e-app/support/serve.mjs` does the setup. It creates a throwaway Postgres database (`lesefluss_e2e_app_<timestamp>`), runs `drizzle-kit migrate` and seeds verified test accounts (`e2e-app/support/users.mjs`). It then builds the embed and the website the way the Dockerfile does and runs `.output/server/index.mjs`. The database is dropped once the server stops, and leftovers from killed runs are dropped at the next start.
  - The `setup` project signs every account in through the real `/login` page, saves the cookie sessions in `e2e-app/.auth/` and seeds friendships and a buddy read over the HTTP API.
  - **Needs:** a local Postgres, taken from `E2E_APP_PG_URL` or the server in `apps/web/.env`'s `DATABASE_URL`; only a new database on it is touched.
  - **`E2E_APP_REUSE_BUILD=1`** skips the build (about 15 s) when `apps/web/.output` and `public/app` exist. Only use it when nothing under `apps/` changed.
  - **Covers:**
    - the selection toolbar (Escape, margin click, resize);
    - signing in from onboarding and from the social tab, and returning to `/app`;
    - an invite link redeemed through the web app;
    - the live board dropping a closed tab;
    - the website's activity toggles;
    - `/app` assets loading without 404s at phone and desktop sizes;
    - the local database surviving an unload mid-save.
  - Not wired into CI. That would need a Postgres service container and `E2E_APP_PG_URL` pointing at it, plus `pnpm exec playwright install chromium`.

## File Structure

```
src/
  pages/
    library/
      index.tsx           # Book grid, import FAB, long-press → action sheet, transfer progress modal
      book-card.tsx        # Individual book card (short tap → reader, long press → action sheet)
      transfer-modal/
    reader/
      index.tsx           # BookReader page - VList, scroll/tap/selection handlers, position sync, font size controls
      paragraph.tsx       # React.memo paragraph component - word spans, heading detection, highlight/selection rendering, utf8ByteLength()
      selection-toolbar.tsx   # Floating two-step toolbar for selections and highlights (actions → colours/note/delete)
      toolbar-position.ts     # Pure toolbar placement: above the selection, else below, else pinned; clamped to screen
      word-at-point.ts        # Word index under a viewport point (used by long-press drag, handle drag, mouse drag)
      highlights-list-modal.tsx # Bottom-sheet listing all highlights for the book; tap to jump
    settings.tsx          # Settings hub - links to RSVP, Appearance, Device, Cloud Sync sub-pages, feedback
    settings/
      rsvp.tsx              # RSVP speed settings (uses useAutoSaveSettings)
      appearance.tsx        # Theme, font, reading time settings (uses useAutoSaveSettings)
      device.tsx            # ESP32 BLE connection, sync to/from device
      sync.tsx              # Cloud sync - sign in/up, sync now, sign out
  components/
    desktop-sidebar.tsx    # Desktop/web sidebar nav (brand, Library, Settings links)
  hooks/
    use-auto-save-settings.ts  # Optimistic settings updates with debounced DB writes (replaces useSettingsDraft)
    use-appearance-settings.ts # Reader appearance settings hook
  contexts/
    DatabaseContext.tsx     # Drizzle DB provider
    BLEContext.tsx          # App-wide BLE connection state + onConnected hook
    BookSyncContext.tsx     # Active-book tracking, position sync, book transfer
    SyncContext.tsx         # Cloud sync state - login, pull/push on mount/resume
  ble/
    index.ts                # Public surface - exports `ble`, `bleClient`, types
    types.ts                # BLEConnectionState, BLEResult, BLE_CONNECTION_TIMEOUT_MS
    client.ts               # BLEClient class (scan/connect/disconnect), `bleClient` singleton
    characteristics/
      index.ts              # `ble` object - single import for all characteristic ops
      settings.ts           # ble.readSettings(), ble.writeSettings() - mapping driven by ESP32_SETTING_KEYS in core
      position.ts           # ble.readPosition(), ble.writePosition()
      transfer.ts           # ble.transferBook() - START/CHUNK/END state machine
      storage.ts            # ble.readStorage() - flash storage info {free_bytes, total_bytes}
    utils/
      encoding.ts           # dataViewToString, stringToDataView, chunkString
  services/
    query-client.ts         # Singleton QueryClient (used by App.tsx + non-React callers)
    book-import/            # Capacitor import wrapper: file/clipboard/share sources + SQLite/filesystem commit
    sync/
      auth-client.ts          # Better Auth client configured with VITE_SYNC_URL
      index.ts                # pullSync, pushSync, scheduleSyncPush, signIn/signUp/signOut, token mgmt
    db/
      index.ts              # Barrel - initDb(), db, sqliteConnection
      adapter.ts            # Drizzle sqlite-proxy adapter + sanitizeParams
      migrations.ts         # Migration runner (reads drizzle/ journal + SQL files)
      web-setup.ts          # jeep-sqlite web bootstrap (no-op on native)
      schema.ts             # Drizzle table definitions
      queries/              # Raw async query functions (import as `queries` object)
        highlights.ts       # getHighlightsByBook, getAllHighlights, addHighlight, updateHighlight, deleteHighlight, deleteHighlightsByBook
      hooks/                # react-query wrappers (import as `queryHooks` object)
        query-keys.ts       # Centralised key factory (bookKeys, settingsKeys) - bookKeys.highlights(id)
        use-books.ts        # useBooks, useBook, useBookContent, useImportBook, useDeleteBook
        use-highlights.ts   # useHighlights, useAddHighlight, useUpdateHighlight, useDeleteHighlight
        use-settings.ts     # useSettings, useSaveSettings
        index.ts            # Barrel - exports `queryHooks` object + key factories
  utils/
    log.ts                  # Structured logger - use instead of console.* everywhere
drizzle/                    # Hand-written SQL migrations
```

## Logging (`src/utils/log.ts`)

All logging in the app must go through `log` - never use `console.*` directly.

```ts
import { log } from "../utils/log";

log("ble", "connected:", deviceId);           // → [Lesefluss][ble] connected: <id>
log.warn("booksync", "position mismatch");    // → [Lesefluss][booksync] position mismatch
log.error("db", "migration failed:", err);    // → [Lesefluss][db] migration failed: ...
```

The `[Lesefluss]` prefix makes it trivial to grep logcat output. The `pnpm android` script already filters logcat to `Capacitor/Console` - all `log()` output lands there.

## Database (`src/db/schema.ts`)

Drizzle ORM with typed queries. Core tables:

| Table | Purpose |
|-------|---------|
| `devices` | BLE device history (name, id, last connected) |
| `settings` | ESP32 settings with defaults |
| `books` | Metadata only (text id = 8-char hex PK, title, author, format, path, size, position, isActive, timestamps) |
| `book_content` | Large data separate (content text, cover image base64, chapters JSON, link ranges JSON, image anchors JSON, serialized word index) |
| `book_images` | Body images of a book (EPUB only): one row per distinct image file, keyed `(book_id, key)` with mime, pixel width/height, `is_line_art`, base64 `data`. Device-local, never synced. |
| `highlights` | Per-book text highlights - startOffset, endOffset (UTF-8 byte, word-start), color, note, timestamps |

- `DatabaseProvider` context wraps the app (`src/contexts/DatabaseContext.tsx`)
- Incremental hand-written SQL migrations in `drizzle/` (e.g. `0013_app_font_size.sql`), each registered in `drizzle/meta/_journal.json`. The runner in `src/services/db/migrations.ts` applies any unapplied entries on app start. To add one: write the SQL file with the next zero-padded index, append a journal entry with `Date.now()` as `when` and the matching `tag`, and update `schema.ts`. For the full cross-package recipe (core defaults, sync schema, ESP32 BLE, UI page) see "Adding a New Setting" in the root `AGENTS.md`.
- `books.id` is a random 8-char hex string (generated at import), also used as `book.hash` on the ESP32 for identity verification
- `isActive` on `books`: boolean, at most one row true at a time - marks the book currently on the ESP32
- `books.size` is the **UTF-8 byte length** of the content string (`utf8ByteLength(content)`), not the JS `.length`. This matches the byte count the ESP32 uses for progress calculation.

## BLE

**Client:** `src/ble/client.ts` - `BLEClient` class, exported as `bleClient` singleton (scan, connect, disconnect, state)
**Characteristics:** `src/ble/characteristics/` - pure functions grouped under the `ble` object
**Context:** `src/contexts/BLEContext.tsx` - app-wide connection state, auto-scan/connect, `onConnected` hook
**Book sync:** `src/contexts/BookSyncContext.tsx` - active book, position sync, file transfer
**UUIDs:** imported directly from `@lesefluss/ble-config` workspace package (no local constants file)

Usage pattern:
```ts
import { ble, bleClient, BLEConnectionState } from "../ble";

await ble.readSettings();
await ble.writePosition(1234);
await ble.transferBook(content, "book.txt", onProgress);
```

- Scans for "Lesefluss", auto-connects when exactly 1 device found
- On connect: position sync runs automatically (device vs app - furthest wins)
- Saves last connected device to SQLite
- BLE status badge (bluetooth icon) between the two tab bar tabs

## Book Import (`src/services/book-import/` + `packages/book-import`)

- Shared parser/source logic lives in `packages/book-import`: pipeline, parser registry, TXT/MD/HTML/EPUB/PDF parsers, shared utilities, and `sources/blob` / `sources/url`.
- `runImportPipeline(input, options, onProgress)` returns a `BookPayload` only. It never writes SQLite or the filesystem.
- `src/services/book-import/index.ts` is the app compatibility wrapper used by hooks. It composes source acquisition → shared parse → `commitBook()` and preserves the existing public API (`importBook`, `importBookFromBlob`, `importBookFromClipboard`, `importBookFromUrl`, `importBookFromText`).
- Capacitor-only sources stay local: file picker via `@capawesome/capacitor-file-picker`, clipboard via `@capacitor/clipboard`, and Android share intent plugin glue.
- `commit.ts` stays local because it writes SQLite and saves original files to `Directory.Data/books/{id}.ext` via `@capacitor/filesystem` on native.
- URL imports pass the app's `CATALOG_URL` into the shared URL source; PDF imports pass the Vite `pdf.worker.mjs?worker` loader into the shared PDF parser.
- Original `.epub` / `.pdf` files are saved on native only; TXT/HTML/MD content is stored as plain text in `book_content`.
- **Body images (EPUB only).**
  - Parse: `extractParagraphsWithLinks` also returns the `<img>` / `<picture>` / `<figure>` / SVG `<image>` elements it meets, each with a char offset but contributing no characters, so `content` is byte-identical to what it was before images were captured (figure captions are still dropped for the same reason). The EPUB parser loads each distinct image once from the archive (`key` = resolved archive path), skips images it cannot load or over the per-image and per-book caps with a warning, and emits `BookPayload.images` plus `BookPayload.imageAnchors` (byte offset of the first text after the image; the content byte length for a trailing image). An image-only page (a map) anchors at the start of the next section with text. Kindle emits every image twice; identical src at the same anchor collapses to one.
  - Prepare: `prepareImage` downscales to a 1600 px longest side and re-encodes (JPEG for photos, PNG kept for transparent or line-art sources), flags line art from a 64x64 sample. The app runs it in a Web Worker (`image-prepare.ts`, injected via `pipelineOptions.prepareImage`, in-thread fallback when `Worker` is missing or the worker fails).
  - Store: `addBookWithContent` converts anchors with "first word at or after the byte" (not `wordOf`, which floors: an anchor on a `# ` heading marker must land on the heading's first word) into `book_content.image_anchors` (`[{word, key, alt}]`). `commitBook` writes row, text, word index and anchors, returns, and only then copies the original file and writes the image rows in the background (`storeBookImages` → `addBookImages`: one insert per row with a yield and a liveness check so a delete stops it; `bookKeys.images` is invalidated periodically so an open reader picks figures up).
  - Repair: if the app was killed mid-write, the reader repairs the book on its next open. `repair-images.ts` diffs anchor keys against stored rows and, on native with the original file on disk, reads it with `readNativeFile` (never `Filesystem.readFile`, which OOMs the bridge on a 5 MB file), loads just those zip entries (`loadEpubImages`), prepares and stores them, once per book per session.
  - Read: `queries.getBookImages(bookId)` (metadata) and `queries.getBookImageData(bookId, key)` (one data URL).
  - Upgrade (transition aid, removable once libraries have been through it): an EPUB with `image_anchors` NULL and its original on disk is re-parsed 3 s after its first open (`upgrade-images.ts`). If the re-parsed text is byte-identical to the stored content, `setBookImageAnchors` writes the anchors on the existing word index and the images are stored like an import; otherwise the book is marked checked (`[]`) and keeps no images. `books.updated_at` never moves.
- `removeBook()` cleans up both DB rows and disk files.
- Import shows parser progress where supported (EPUB/PDF).

### epubjs quirks (types are incomplete/wrong)

- `spine.length` exists at runtime but is not in the type definitions - cast needed
- `section.load()` returns `Promise<Element>` at runtime but types say `Document` - cast needed
- `spine.items` exists at runtime but is not typed - use `spine.each()` (typed) to iterate sections or `spine.get(i)` for indexed access
- `book.loaded.cover` resolves to `string | undefined` at runtime despite types saying `Promise<string>`
- `book.archive` can be `undefined` at runtime despite types saying `Archive` - guard before use
- `PackagingMetadataObject` types are correct: use `.creator` (not `.author`) for the author field

## Database queries (`src/db/queries/books.ts`)

- All IDs are `string` (8-char hex), not integers
- **`updateBook(id, data)`** - generic partial updater, accepts any subset of `Book` fields. Use this instead of raw SQL or adding single-field helpers. e.g. `updateBook("a1b2c3d4", { isActive: true })`, `updateBook("a1b2c3d4", { position: 1234, lastRead: Date.now() })`
- **`addBookWithContent(book, content, coverImage?, chapters?)`** - inserts into both `books` and `book_content` tables. `book.id` must be provided (generated by caller).
- **`deleteBook(id)`** - deletes from both tables (content first, then metadata). For full cleanup including disk files use `removeBook()` from `bookImport.ts`

## React Query (`src/services/db/hooks/`)

All DB reads and writes in React components go through `queryHooks`, not raw `queries.*` calls. Raw `queries.*` still exists for non-React code (services, contexts) and for high-frequency fire-and-forget writes (position saves in the reader).

### Usage pattern

```ts
import { queryHooks } from "../services/db/hooks";
import { bookKeys, settingsKeys } from "../services/db/hooks/query-keys";

// Reads
const { data, isPending }  = queryHooks.useBooks();
const { data: book }       = queryHooks.useBook(id);
const { data: content }    = queryHooks.useBookContent(id);
const { data: settings }   = queryHooks.useSettings();

// Writes (mutations - auto-invalidate the relevant queries)
const importBook  = queryHooks.useImportBook();
importBook.mutate({ onProgress: (pct) => setProgress(pct) });

const deleteBook  = queryHooks.useDeleteBook();
deleteBook.mutate(book);

const save = queryHooks.useSaveSettings();
save.mutate({ wpm: 400 });
```

### Key conventions

- **`staleTime: Infinity`** globally - SQLite is local; data only changes when we write. No background refetching.
- **Mutations handle invalidation** - every `useMutation` has an `onSuccess` that invalidates the right keys.
- **Key hierarchy** - `bookKeys.all = ['books']` is a prefix of `bookKeys.detail(id) = ['books', id]`, so invalidating `bookKeys.all` cascades to all detail/content queries.
- **Position saves in the Reader** use raw `queries.updateBook()` directly - fire-and-forget, high-frequency writes.
- **Non-React callers** (BLE contexts, bookImport.ts) use raw `queries.*` for writes; call `queryClient.invalidateQueries()` if UI refresh needed.
- **`useIonViewWillEnter`** in Library calls `qc.invalidateQueries({ queryKey: bookKeys.all })` to refresh when navigating back from the reader.
- **Settings pages** use `useAutoSaveSettings()` - optimistic cache update on every change, debounced DB write (300ms). Replaces the old draft-then-save pattern. `updateSetting(key, value)` for individual fields, `replaceAll(patch)` for bulk updates (e.g. loading from BLE). Flushes pending writes on unmount.

## Book Reader (`src/pages/reader/`)

Full-screen virtualized scroll reader split across three files:
- `index.tsx` - page shell, data loading, scroll/tap/selection handlers, position sync, progress bar, TOC/highlights modals, theme
- `paragraph.tsx` - `React.memo` component for a single paragraph; word spans, heading detection, highlight/selection rendering
- `selection-toolbar.tsx` - floating toolbar for a selection or a highlight; two steps (see Highlights & annotations)
- `use-highlight-selection.ts` - selection state machine, handle drags, toolbar positioning (`toolbar-position.ts`), highlight saves
- `highlights-list-modal.tsx` - bottom-sheet listing all book highlights ordered by position; tap to jump
- `dictionary-modal.tsx` - bottom-sheet modal fetching definitions from the catalog service's own dictionary via react-query

Uses `virtua`'s `VList` for virtualisation (~20–30 paragraphs in the DOM at any time regardless of book size).

### Position = UTF-8 byte offset

All positions are **UTF-8 byte offsets** into the content string - the same number the ESP32 stores in `position.txt` and reports over BLE. This is critical: use `utf8ByteLength()` (exported from `Paragraph.tsx`, wraps `TextEncoder`) everywhere offsets are calculated. Never use JS `.length`, which counts UTF-16 code units and diverges for any non-ASCII character.

### Data model

Computed once in `useMemo([content])` in `index.tsx`:

```ts
paragraphs: string[]       // content.split("\n\n") - needed for VList item count
paragraphOffsets: number[] // UTF-8 byte offset where each paragraph starts in content
chapters: Chapter[]        // parsed from contentRow.chapters JSON; empty for TXT books
```

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

- **`VListHandle`** via `useRef<VListHandle>` - exposes `findItemIndex`, `scrollToIndex`, `getItemOffset`, `getItemSize`, `cache`
- **`CacheSnapshot`** stored in a module-level `Map<bookId, CacheSnapshot>` on unmount; restored via `cache` prop on mount - pixel-accurate scroll restoration
- **`onScrollEnd`** fires position save (no debounce timer needed): the viewport-top word. It keeps the last settled word (`settledWordRef`) when the view moved less than 4px since the last scroll end (layout clamp, soft keyboard), and at the very bottom, where a later saved word is still on screen but can never reach the top
- **Scroll ticks** only know the paragraph, so they never replace a finer saved word in the same paragraph (or a later one at the very bottom); otherwise leaving mid-scroll would flush a paragraph-start rewind
- **Two offset states:** `activeOffset` (word highlight, set to `-1` while scrolling) and `progressOffset` (progress bar, updated every scroll frame)
- **Word tap - two-stage:** first tap highlights the word and saves position; second tap on the already-highlighted word opens the dictionary modal
- **Heading paragraphs** (prefixed `# `) are not tappable
- **Body images** (EPUB imports, see `book_images` above): `index.tsx` parses `contentRow.imageAnchors` and loads image metadata with `queryHooks.useBookImages`, then `buildFigureMap` (`reader-figures.ts`) keys each figure by the paragraph containing its anchor word's byte (`wordIndex.byteOfClamped` against `paragraphOffsets`; paragraph start words are floored, so comparing words would misplace an image before a `# ` heading); anchors at or past the word count become `trailingFigures`. Both views pass `figuresByParagraph` into `Paragraph`, which renders the figures above the inline chapter heading and the text (also for `# ` heading paragraphs); trailing figures render after the last paragraph (scroll) or in the last chunk (page). `ReaderFigure` loads one data URL via `bookKeys.image(bookId, key)` and renders nothing when the bytes are not stored. Figures carry no `data-word` spans, so position save, alignment and pagination ignore them. The figure carries `aspect-ratio` inline (4:3 when the size could not be sniffed at import) so the box is sized before load and the img only mounts once its data URL is known, `draggable={false}` (WebView long-press freeze), and CSS caps it under `--reader-page-height` in page mode with `break-inside: avoid`. Themes: sepia `mix-blend-mode: multiply`; dark inverts only `.reader-figure--line-art` (import-time flag) and screens it into the page.
- **Routing** - `/reader/:id` is placed outside `IonTabs` in `App.tsx` so the tab bar is not rendered

### Reading themes

Two themes stored in `localStorage` under `reader_theme`:
- **`dark`** (default) - `#1a1a1a` background, `#e4e4e4` text
- **`light`** - `#ffffff` background, `#111111` text

Applied as a `reader-theme-{name}` class on `IonPage`. Only affects the reader - Library and Settings stay monochrome.

### Progress bar

Fixed bar at the bottom of `IonContent`, positioned `calc(env(safe-area-inset-bottom) + 8px)` above the screen edge. Tap or drag (pointer capture) to scrub. Updates live during scrolling via `progressOffset`.

### TOC / Chapter navigation

`listOutline` toolbar button - only rendered when `chapters.length > 0` (EPUB imports only). Opens a sheet modal listing all chapters; tapping binary-searches `paragraphOffsets` for its `startByte` and scrolls there. On open, `ContentsList` marks the current chapter (`aria-current`) and scrolls it near the top of the half-height sheet, expanding the sheet to full height when the scroll clamps near the end of the list; serials pass `currentBookId` to `SeriesChapterList`, which does the same once per mount via `VList.scrollToIndex`.

### Highlights & annotations

Long-press any word to enter selection mode (haptic tick via `services/haptics.ts`); keep the finger down and drag to extend, or drag the two handles afterwards. Desktop: mouse-drag across words.

The floating toolbar has two steps:
- **actions** (unsaved selection): Highlight, Note, Look up (single word only, disabled otherwise), Glossary, Comment (buddy read only). Highlight and Note save with the last-used colour (`localStorage` `lesefluss:highlight-color`); Note saves first so a note is never lost.
- **styled** (saved highlight): colour swatches, Note, Share (buddy read only), Delete.

Long-pressing a highlighted word (or tapping it a second time in scroll mode) selects the existing highlight in the styled step; dragging a handle then resizes it (committed on release). There is no close button: tapping outside dismisses, and a saved highlight stays saved. The Highlights tab of the annotations sheet lists all highlights; tap to jump.

- Offsets stored as UTF-8 byte word-start offsets (same as `data-offset` on word spans)
- Overlapping highlights allowed; most-recently-created color wins visually
- Deleting a book cascades to its highlights (`deleteHighlightsByBook` called in `deleteBook`)
- `highlightsByParagraph: Map<index, HighlightRange[]>` memoized in the reader
- Handles use `touch-action: none`; during a long-press drag `paragraph.tsx` blocks `touchmove` so the page doesn't scroll, and page mode ignores the drag instead of swiping

### Dictionary lookup

Tap an already-highlighted word → opens a bottom-sheet with the definition from the catalog's `GET /dictionary` endpoint, backed by our own Wiktionary-derived data. Results cached permanently by react-query, keyed by word *and* book language.

The word is sent with its original casing and no normalisation — the server owns the lookup-key rule, so there is one definition of it rather than two that can drift, and casing disambiguates German homographs ("Bäume" the trees vs "bäume" the verb).

Shows part of speech, up to 3 definitions per part of speech, and examples. Inflected forms resolve to their lemma and show the relationship ("Sprüche → Spruch"). When the answering language differs from the book's, a chip names it, so a fallback is never silently authoritative. Wiktionary CC BY-SA attribution is rendered with every entry — a licensing requirement, not decoration.

### Library interaction model (`BookCard.tsx`)

- **Short tap** (< 400ms) → `history.push('/reader/:id')`
- **Long press** (≥ 400ms) → action sheet (Set active on device / Delete)
- `onTouchMove` cancels the long-press timer so grid scrolling never accidentally triggers the action sheet

## Cloud Sync (`src/services/sync/`)

Full-snapshot sync with the web server. Shared Zod schemas and types in `@lesefluss/core`.

**Auth:** Native uses Better Auth client (`auth-client.ts`) with `VITE_SYNC_URL` env var (points to `https://lesefluss.app`) and Bearer token from `@capacitor/preferences`. Web embed uses same-domain cookie auth (no token needed).

**Sync protocol:** `pullSync()` → GET `/api/sync`, merge (last-write-wins by `updatedAt`). `pushSync()` → POST `/api/sync` with full local snapshot. `fullSync()` = pull then push. `SYNC_ENABLED` flag controls whether sync runs (`!!SYNC_URL || IS_WEB_BUILD`).

**Auto-push:** All DB mutation hooks (`useImportBook`, `useDeleteBook`, `useSaveSettings`, `useAddHighlight`, `useUpdateHighlight`, `useDeleteHighlight`) call `scheduleSyncPush()` on success - debounced 2s POST (5s for settings to absorb rapid slider changes).

**Auto-pull:** `SyncContext` triggers `fullSync()` on mount (if logged in) and on app resume.

**Concurrency:** `withSyncLock()` uses a promise-chain queue to prevent concurrent pull/push from racing.

**What syncs:** books (metadata, position, and full content/cover/chapters for cross-device restore - content only pushed once per book), settings (syncable fields only, not device-specific like BLE/brightness), highlights (server tombstones deletions).

**UI:** Settings → Cloud Sync sub-page (`settings/sync.tsx`). Sign in/up form when logged out; email, last synced, sync now, sign out when logged in.

## Conditional CSS Classes

Never use template literals to append conditional class names - Biome strips the leading space, breaking the output (`"foo bar"` becomes `"foobar"`). Use a plain ternary instead:

```tsx
// Wrong - Biome will remove the space before "active"
className={`sidebar-item${isActive ? " active" : ""}`}

// Correct
className={isActive ? "sidebar-item active" : "sidebar-item"}
```

## UI

- **4 tabs:** Library (default), Explore, Social, Settings. Social lives in `src/pages/social/` (friends, requests, invite link, blocked users); invite deep links are documented in `docs/deep-links.md`
- **Desktop/web:** sidebar nav replaces tab bar (`desktop-sidebar.tsx`) - brand link (→ `/` on web, static on native), Library and Settings nav items
- BLE status badge between tabs on mobile (no dedicated connection page)
- **Library:** book grid (3 cols), cover art, progress bar, "On device" badge; empty state; FAB to import; sync button in header (triggers cloud sync); short tap → reader; long press → action sheet; transfer progress modal
- **Settings:** hub page linking to RSVP, Appearance, Device, Cloud Sync sub-pages, export, changelog, onboarding, and the website feedback form
- **BookReader:** full-screen virtualized reader, word highlight, back button, dark/light theme toggle, progress bar, TOC navigation, dictionary lookup; position syncs bidirectionally with ESP32
