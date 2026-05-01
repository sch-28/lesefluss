---
id: doc-2
title: Book import architecture — state &amp; roadmap
type: other
created_date: '2026-04-26 11:35'
updated_date: '2026-05-01 15:37'
---
_Working notes for the Phase 5 (Content Ingestion) refactor in `apps/capacitor`. This file is a handoff for the next agent / session. When all Phase 5 parsers have landed, delete it._

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
- `packages/core/src/sync.ts` — `sourceUrl` on `SyncBookSchema`
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

## Web Novel / Serial Scraping — shipped

The serial-scrapers subsystem (Task-37) shipped four providers (AO3,
ScribbleHub, Royal Road, Wuxiaworld), Explore-tab discovery, update-on-open
polling, and chapter list inside SeriesDetail. The original design notes
lived in doc-1; that document was retired once all adapters landed. The
canonical reference is now the in-code header comments under
`apps/capacitor/src/services/serial-scrapers/`.
