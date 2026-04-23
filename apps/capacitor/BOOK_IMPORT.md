# Book Import Architecture — State & Roadmap

Working notes for the Phase 5 (Content Ingestion) refactor in `apps/capacitor`.
This file is a handoff for the next agent / session. When all Phase 5 parsers
have landed, delete it.

## Why this exists

Phase 5 of `agents/roadmap.md` adds multiple ingestion paths: PDF, pasted text,
URL share (Android share intent + readability), and Calibre. The original
`services/book-import.ts` was a single 520-line file that mashed file picking,
TXT decode, EPUB parse, cover extraction, paragraph DOM walk, DB insert, and
filesystem write into one flow. `services/catalog/import.ts` bolted on a second
export (`importBookFromBlob`) as its only reuse seam.

We split along the axes that actually vary: **Source → RawInput → Parser →
BookPayload → commit**. A single internal `runImportPipeline` wires the middle
three; every public entry point is a two-line composition over a source plus
the pipeline. Each source/parser is one small file with one job.

## Current state (completed)

Structure at `apps/capacitor/src/services/book-import/`:

```
index.ts              # public API — thin compositions (see below)
pipeline.ts           # runImportPipeline(input, extras?, onProgress?) — sole path to commitBook
commit.ts             # commitBook(payload, extras) — single DB + FS writer; removeBook
types.ts              # RawInput, BookPayload, ImportExtras, Parser
sources/
  file-picker.ts      # pickFileFromPicker() — native FilePicker + web <input>
  blob.ts             # blobToRawInput(blob, fileName)
  clipboard.ts        # readClipboardToRawInput() — @capacitor/clipboard + web fallback
  url.ts              # fetchUrlToRawInput(url) — via catalog /proxy/article
  share-intent.ts     # subscribeShareIntent(cb) — custom Android plugin bridge
parsers/
  registry.ts         # pickParser(input) — first canParse() match wins
  txt.ts              # txtParser   (bytes: .txt or text/* mime)
  epub.ts             # epubParser  (bytes: .epub or application/epub+zip)
  html.ts             # htmlParser  (bytes: .html/.htm or text/html — Readability + fallback)
  text.ts             # textParser  (kind: "text" — shared by clipboard + share-intent text)
utils/
  dom-paragraphs.ts   # extractParagraphs, collectBlocks, extractHeadingText
  encoding.ts         # utf8ByteLength, base64 ↔ ArrayBuffer
  id.ts               # generateBookId (8-char hex)
  raw-input.ts        # assertBytes / assertText type-assertion helpers
  title-heuristic.ts  # deriveTitle(text) — first non-empty line ≤80 chars, else timestamp
  url-guards.ts       # normalizeUrl, isLikelyUrl, displayHostname
```

Outside `book-import/` but part of this subsystem:

```
src/components/share-intent-handler.tsx   # listens once on mount, routes to URL vs text import
src/pages/library/use-library-imports.ts  # consolidates import mutations + UI state for library page
src/pages/library/paste-url-modal.tsx     # URL input modal
```

### Public API

```ts
importBook(onProgress?): Promise<Book>                     // file picker → DB (TXT/EPUB/HTML)
importBookFromBlob(blob, fileName, onProgress?, extras?)   // blob → DB (catalog uses this)
importBookFromClipboard(): Promise<Book>                   // clipboard → DB
importBookFromUrl(url): Promise<Book>                      // URL → proxy → Readability → DB
importBookFromText(text, hint?): Promise<Book>             // plain-text string → DB (share intent)
removeBook({ id, filePath })                               // disk + DB cleanup
```

Error contract (caught by `useLibraryImports` and `ShareIntentHandler`):
- `"CANCELLED"` — picker dismissed (silent).
- `"EMPTY"` — clipboard has no text (toast).
- `"INVALID_URL"` — URL input not http/https (toast).
- `"TOO_LARGE"` — proxy rejected >5MB response (toast).
- `"FETCH_FAILED"` — proxy/network error (alert).
- Anything else → generic "Import Failed" alert.

### Core types

```ts
export type RawInput =
  | { kind: "bytes"; bytes: ArrayBuffer; fileName: string; mimeType?: string }
  | { kind: "text"; text: string; hint?: { title?: string; url?: string } };

export type BookPayload = {
  content: string;                               // paragraph-separated; ESP32-ready
  title: string;
  author?: string | null;
  coverImage?: string | null;                    // base64 data URL
  chapters?: Chapter[] | null;
  fileFormat: "txt" | "epub" | "html";           // widen when adding new parser
  original?: { bytes: ArrayBuffer; extension: string } | null;
};

export type ImportExtras = {
  source?: string | null;         // 'gutenberg' | 'standard_ebooks' | 'url' | null
  catalogId?: string | null;
  sourceUrl?: string | null;      // original href for source='url' imports
};

export interface Parser {
  readonly id: string;
  canParse(input: RawInput): boolean;
  parse(input: RawInput, onProgress?): Promise<BookPayload>;
}
```

### Pipeline flow

```
source → RawInput → pickParser → parse → BookPayload → commitBook → Book
                         └── registry picks first canParse() match
```

Every entry point in `index.ts` is:

```ts
export async function importBookFromX(...): Promise<Book> {
  const input = await someSource(...);
  return runImportPipeline(input, extras, onProgress);
}
```

`runImportPipeline` lives in `pipeline.ts` and is the ONLY place that calls
`pickParser` and `commitBook` in sequence. Adding a new path must not bypass
it — otherwise sources drift on commit semantics.

### Guardrails

- **`assertBytes` / `assertText`** (`utils/raw-input.ts`) narrow `RawInput`
  inside parser `parse` bodies. Use them at the top to eliminate `as` casts.
- **Progress reporting** — parsers call `onProgress?.(pct)` with values 0–100.
  Callers wrapping parsers (e.g. `importFromCatalog` mapping 80–100%) do the
  math; parsers always emit absolute 0–100.
- **Original-file save is parser-controlled.** TXT/HTML/text-kind return
  `original: null` (content is lossless or not worth preserving). EPUB/PDF set
  `{ bytes, extension }` to preserve the source for re-parse. `commit.ts` only
  writes on native (`Capacitor.isNativePlatform()` guard).
- **Single ID writer.** Nothing outside `commit.ts` generates book IDs.
- **Single commit path.** Nothing outside `pipeline.ts` calls `commitBook`
  (except the catalog-side flow, which goes through `importBookFromBlob`
  which goes through the pipeline).
- **Logging** goes through `../../utils/log` with the `book-import` /
  `share-intent` namespace. Never use `console.*`.

### Hook layer (`services/db/hooks/use-books.ts`)

One mutation factory, used by every import variant:

```ts
function useBookImportMutation<TVars>(fn: (v: TVars) => Promise<Book>) {
  // invalidates bookKeys.all + bookKeys.covers; calls scheduleSyncPush on success
}
```

Variants exported via `queryHooks`:
`useImportBook`, `useImportBookFromClipboard`, `useImportBookFromUrl`,
`useImportBookFromText`, `useDeleteBook`.

A new source should add a 2-line hook using this factory — no new cache
invalidation code.

### Sync

`source_url` column exists on both local SQLite and remote Postgres:
- `apps/capacitor/src/services/db/schema.ts` — `sourceUrl: text("source_url")`
- `apps/capacitor/drizzle/0010_source_url.sql` + journal entry
- `apps/web/src/db/schema.ts` — `sourceUrl: text("source_url")` on `syncBooks`
  (remote uses `drizzle-kit push`, no per-migration file)
- `packages/rsvp-core/src/sync.ts` — `sourceUrl` on `SyncBookSchema`
- `apps/capacitor/src/services/sync/index.ts` — `bookToSync` + inbound apply
- `apps/web/src/routes/api/sync.ts` — pull select, push upsert, COALESCE preserve

### Native (Android share intent)

- `apps/capacitor/android/app/src/main/java/app/lesefluss/ShareIntentPlugin.java`
  — custom `@CapacitorPlugin`, `notifyListeners("shareReceived", …, retain=true)`.
- `MainActivity.java` — `registerPlugin(ShareIntentPlugin.class)` in `onCreate`;
  `onNewIntent` forwards to the plugin via `bridge.getPlugin("ShareIntent")`.
- `AndroidManifest.xml` — `<intent-filter>` for `ACTION_SEND` + `text/plain`
  on the existing `MainActivity` activity.
- **After touching any of the above, run `npx cap sync android`** before
  building, otherwise Gradle won't pick up the manifest/plugin changes.

### Catalog proxy (for URL import CORS)

`apps/catalog/src/routes/proxy.ts` — `POST /proxy/article { url }`.
Guards: http/https only, DNS-resolve + reject RFC1918/loopback/link-local/ULA,
10s timeout, 5MB cap, `text/html` content-type gate. Returns
`{ html, contentType, finalUrl }`. Mounted under the global rate-limit
middleware.

SSRF note: the resolve-then-fetch-by-hostname pattern leaves a small DNS
rebinding window. Documented in-file as a TODO (fetch resolved IP directly
with `Host` header override to close it).

## Roadmap — follow-up PRs

Each item below should be a single focused PR. Order is suggested but not
strict.

### 1. PDF parser (`parsers/pdf.ts`) — not yet done

- Add `pdfjs-dist` dep (~500KB; import `legacy/build/pdf` entry to avoid
  worker setup pain in the WebView).
- `canParse`: `.pdf` extension or `application/pdf` mime.
- Extract per-page text via `getTextContent()`; reconstruct paragraphs by
  grouping items whose `transform[5]` (y-position) is close on the same page,
  inserting `\n\n` between paragraphs and between pages. Prototype on several
  test PDFs (novels, technical, scanned-but-OCRed) before committing.
- No cover image (or optional: render page 1 to canvas → base64).
- `fileFormat: "pdf"` — widen the union in `types.ts` and the comment in
  `services/db/schema.ts`. Grep for `fileFormat ===` / `fileFormat as` before
  shipping to catch branchy callers.
- Set `payload.original = { bytes, extension: "pdf" }` so re-parse is possible.
- Progress: `onProgress((i + 1) / pageCount * 100)` in the per-page loop.
- Add `"application/pdf"` to the file-picker `types` array and `.pdf` to the
  web accept list (`sources/file-picker.ts`).
- New `index.ts` export not needed — file picker flow covers it.

### 2. Calibre import — not yet done

- Calibre library is a folder with a `metadata.db` SQLite file + per-book
  subfolders holding EPUB/PDF/cover. On Android this is typically on external
  storage.
- **Source**: new `sources/calibre.ts`. User picks library root via
  `@capacitor/filesystem` + SAF; source reads `metadata.db` via `sql.js` (check
  if already a transitive dep) and yields **multiple** `RawInput`s. This is
  the first multi-book source — does **not** fit the single-book `importBook`
  → `commitBook` contract.
- Add a parallel API in `index.ts`:

  ```ts
  importFromCalibre(dirUri, onProgress?): AsyncIterable<Book>
  ```

  Internally it loops: for each book, pick parser, commit, yield. UI shows a
  multi-file progress dialog. Don't buffer into `Promise<Book[]>` — a
  500-book library would blow memory.
- `source: "calibre"` on each imported book.
- **Idempotency**: Calibre has a per-book UUID. Either reuse `catalogId`
  (`calibre:<uuid>`) and skip duplicates, or add a dedicated `externalId`
  column. Whichever is chosen, test the re-import flow carefully — users WILL
  re-import the same library.

### 3. iOS share extension — deferred

Android ships in this PR via the custom plugin. iOS requires a separate
Xcode share-extension target with its own `Info.plist`, entry-point code,
and container-app data bridging (typically an App Group + shared
UserDefaults). Significant work; defer until user base justifies it. The
`sources/share-intent.ts` JS wrapper API is platform-agnostic, so swapping
in an iOS implementation later won't ripple past that file.

### 4. Kindle `My Clippings.txt` — explicitly deferred by user

Not a book — a flat text file of highlights/notes. Doesn't fit `BookPayload`.
Route through a separate `services/kindle-clippings.ts` that writes directly
into the `highlights` table, matching books by title (fuzzy) and creating
stub books when no match. Lives outside book-import entirely.

### 5. Web proxy SSRF hardening — nice to have

Fetch the resolved IP directly with `Host:` header override to close the
DNS-rebinding window documented in `proxy.ts`. Low priority — current guards
are defense-in-depth and the proxy has no privileged upstream to exploit.

## Future directions (not planned — ideas only)

These extend the *discovery* side of the app (Explore tab) rather than the
import pipeline itself. Document here so the import contract stays the load-
bearing design constraint when these land.

### Curated article sources on Explore

Today Explore lists Gutenberg + Standard Ebooks books. Natural extension:
surface good-quality long-form article sources (Longreads, Aeon, Paul Graham
essays, selected Substacks, LRB/NYRB public pieces). Implementation options:

- **Server-side feed aggregation** — catalog grows a `articles/*` route group
  that polls a curated list of RSS/Atom feeds on a cron (like `runSync` does
  for books), stores the last N entries in a `catalog_articles` table, and
  exposes search/browse endpoints mirroring `/books`. Capacitor Explore adds
  an "Articles" tab; picking one runs through `importBookFromUrl` (already
  built — just pre-filled URL).
- **Client-side curated list** — simpler: hardcode a JSON list of feed URLs
  in the catalog, render latest items via the existing URL import flow. No
  new tables, no polling.

Tradeoffs: full aggregation is the better UX (search, covers, dedup across
feeds) but adds a second sync engine to keep alive. Start with the hardcoded
list + URL-import and upgrade only if Explore traffic justifies it.

Legal: only aggregate feeds that explicitly publish full-text RSS, or only
store titles + links and import via proxy on click. Don't mirror paywalled
content.

### Web novel scraping (Royal Road, ScribbleHub, Wuxiaworld, …)

Multi-chapter serial fiction is a distinct shape from everything else in the
import pipeline: a single "book" is 50–2000+ chapters, published over time,
and users often start reading before the work is complete. Three strategies,
each with real tradeoffs:

1. **Eager full scrape** — fetch every chapter up-front, concatenate into
   one `content` blob, fits existing `BookPayload`. Simple; matches the
   current data model. Bad for: 1500-chapter serials (megabytes of text, slow
   initial import, can't reflect new chapters without re-import). Best for
   **completed** works.

2. **Lazy / on-demand chapters** — store only metadata + per-chapter URLs;
   fetch each chapter when the reader gets within N chapters of it. Requires
   schema change: new `book_chapters_remote` table with `(bookId,
   chapterIdx, url, fetchedAt, content)`. Reader needs to know the book is
   "remote-sourced" and trigger fetches. Breaks the "content is one blob"
   assumption ESP32 sync depends on — would need a separate "chapters only"
   sync path or mark remote-source books as ineligible for device transfer.

3. **Hybrid** — eager-import the first 50 chapters (fits the current model,
   user can start reading immediately), lazy-fetch the rest, periodically
   check for updates on ongoing serials. Most complex; probably the right
   end-state if this feature matters.

Scraping mechanics regardless of strategy:
- **Per-site adapters** in `sources/novel-scrapers/<site>.ts`: each knows
  how to extract chapter-list TOC, chapter title, chapter body, and
  next-chapter link. Selectors will break — plan for quarterly maintenance.
- **Generic fallback** — "follow `rel=next` link" heuristic for sites we
  don't know. Readability handles body extraction. Works for ~60% of sites.
- **Rate limiting** — proxy adds a stricter bucket for `/proxy/novel/*` or
  equivalent; scrapers sleep between requests; respect `robots.txt`.
- **Update detection** — periodic HEAD request on the TOC page, compare
  chapter count. New chapters become a push notification or a badge on the
  library card.

Discovery side: Explore gets a "Serials" tab sourced from site RSS feeds
(Royal Road publishes one per fiction). User clicks → we trigger the scrape
+ import (strategy 1 for completed, 3 for ongoing).

Legal/ethical: Royal Road's ToS allows personal scraping; ScribbleHub is
similar; Wuxiaworld is licensed translations with stricter rules. Check
per-site ToS before shipping an adapter. Never ship a bulk-scraper that
could DoS a small site — throttle aggressively and cache at the proxy.

**Don't start this as one PR.** Sequence: (a) eager-scrape one site behind a
feature flag; (b) wire reader support for remote chapters; (c) add second
site; (d) update detection; (e) Explore integration. Each step is shippable
and exits cleanly if the feature doesn't find users.

## Adding a new source or parser

**New parser** (single-format, fits the existing contract):
1. Add `parsers/<format>.ts` implementing `Parser`. Use `assertBytes` or
   `assertText` at the top of `parse`.
2. Register in `parsers/registry.ts` PARSERS array — specific matchers before
   fallbacks.
3. Widen `BookPayload.fileFormat` union in `types.ts`.
4. Update the `file_format` comment in `services/db/schema.ts`.
5. Grep for `fileFormat ===` / `fileFormat as` — update any branches.
6. If acquired via picker, add the MIME to `sources/file-picker.ts`.
7. If the parser needs a dedicated entry point (uncommon), add a 2-line
   function in `index.ts` that obtains the RawInput and calls
   `runImportPipeline`.

**New source** (new acquisition mechanism):
1. Add `sources/<source>.ts` exporting a function that returns `RawInput` (or
   throws a well-known error string the UI can handle).
2. Add a 2-line entry point in `index.ts`.
3. Add a 2-line hook in `use-books.ts` using `useBookImportMutation`.
4. Register in `use-library-imports.ts` if it should appear in the library's
   action sheet, or wire it into `ShareIntentHandler` if it's an external
   trigger.

**Never edit**: `pipeline.ts`, `commit.ts`, the `Parser` interface, the
`runImportPipeline` signature. Reaching into any of these means your change
belongs somewhere else — stop and reconsider.

## Verification (any PR touching this area)

1. `cd apps/capacitor && pnpm check-types` — clean. **Note:** the script is
   `check-types`, not `check` (which runs Biome).
2. `cd apps/catalog && pnpm check-types` if you touched the proxy.
3. `cd apps/web && pnpm check-types` if you touched the sync schema.
4. Smoke in `pnpm start`:
   - Import TXT → reader renders with filename as title.
   - Import EPUB → cover + author + chapters populated; reader TOC works.
   - Import HTML file → Readability-cleaned content.
   - Paste URL (needs catalog running locally or set `VITE_CATALOG_URL`) →
     article content + hostname shown on book-detail.
   - Paste text → content + first-line title.
   - Delete book → disk file (native) and DB rows gone.
5. Catalog flow: Explore → Gutenberg/Standard Ebooks book → Import → `source`
   and `catalogId` set.
6. Web embed build: `WEB_BUILD=1 VITE_SYNC_URL="" VITE_WEB_BUILD=true pnpm build`
   succeeds; TXT/EPUB/HTML import via HTML5 file input works; no FS write
   attempted.
7. Dismiss the picker → `"CANCELLED"` thrown from `sources/file-picker.ts`,
   swallowed in the library hook.
8. Logged-in import triggers `scheduleSyncPush()` (one `[Lesefluss][sync]`
   line). `sourceUrl` round-trips if set.
9. On device: `npx cap sync android && npx cap run android`. Share a URL from
   Chrome → Lesefluss appears in the sheet → toast "Imported: …" → book
   appears. Share plain text → ends up as a pasted-text book.
