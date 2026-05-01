# Lesefluss

Monorepo: ESP32 hardware speed reader + mobile companion app.

## Structure

```
lesefluss/
├── agents/
│   ├── esp32.md        # ESP32 firmware reference
│   ├── capacitor.md    # Capacitor app reference
│   ├── web.md          # Website reference + roadmap
│   ├── catalog.md      # Catalog service reference
│   └── roadmap.md      # Publishing + business roadmap (Play Store, DIY guide, monetisation)
├── apps/
│   ├── esp32/          # MicroPython ESP32 Lesefluss reader
│   ├── capacitor/      # Ionic React mobile + web app
│   ├── web/            # TanStack Start website (marketing, auth, sync API, hosts capacitor web build)
│   └── catalog/        # Hono API service for public-domain book discovery (Gutenberg + Standard Ebooks)
├── packages/
│   ├── ble-config/     # Shared BLE UUIDs (workspace package)
│   ├── book-import/    # Shared book import pipeline/parsers/sources (no app deps)
│   └── core/           # Shared engine, settings, sync/auth types and utilities
├── resources/
│   └── icon.svg        # Master app icon (1024×1024, edit this)
└── AGENTS.md           # This file
```

## First-time setup

```bash
pnpm install
pnpm setup:project      # generates BLE config + Android icon PNGs from resources/icon.svg
```

## What It Does

Displays books word-by-word at configurable speed (RSVP - Rapid Serial Visual Presentation) on a handheld ESP32 device. The companion app manages your book library, syncs settings via BLE, and includes a full software RSVP reader + scroll reader. The website at `lesefluss.app` hosts a web version of the app at `/app`, handles auth and cloud sync, and showcases the project.

## Development

```bash
# Capacitor app
cd apps/capacitor
pnpm install
pnpm start          # Vite dev server at http://localhost:3001

# ESP32 firmware
cd apps/esp32
./scripts/setup.sh --board ST7789   # First time: flash firmware + upload all (ST7789)
./scripts/setup.sh --board AMOLED   # First time: flash firmware + upload all (AMOLED)
./scripts/upload.sh --board ST7789  # Upload changed files
./scripts/run.sh                    # Test run without reboot
```

**Formatter:** Biome (`biome.json` at repo root). Run `pnpm biome check` or let the IDE plugin handle it.

### Development Workflows

**ESP32:** edit in `apps/esp32/` → `./scripts/upload.sh` → device auto-restarts. Use dev mode (`devmode` file on device) to prevent auto-start while iterating.

**Capacitor:** edit in `apps/capacitor/` → hot reload via Vite. Use BLE simulator/mock without hardware. Test with real ESP32 for integration.

**BLE end-to-end:** enable BLE on ESP32 (`BLE_ON` checkbox in web UI) → launch companion app → scan → connect → verify bidirectional settings sync → test disconnect/reconnect.

## BLE Integration

Both apps communicate over BLE. This is the shared contract:

- Device name: `Lesefluss`
- Service UUID: `ad1863bc-9b9d-4098-a7ce-3ba1d2aabaf9`
- UUIDs live in `packages/ble-config/`

| # | Characteristic | Flags | Purpose |
|---|---|---|---|
| 1 | Settings | R/W | RSVP settings JSON |
| 2 | File Transfer | W + Notify | Chunked book upload (350-byte raw chunks, base64-encoded frames) |
| 3 | Position | R/W | Current byte offset in active book (bidirectional) |
| 4 | Storage | R | Flash storage info: `{"free_bytes": n, "total_bytes": n}` |

**Settings payload** (~90 bytes):
```json
{
  "wpm": 350, "delay_comma": 2.0, "delay_period": 3.0,
  "accel_start": 2.0, "accel_rate": 0.1, "x_offset": 50,
  "word_offset": 5, "inverse": false, "ble_on": true
}
```

**Position payload**: `{ "position": 58203 }` - byte offset into `book.txt`.
Device is authoritative on connect; app can push position when reading in-app.

**File transfer protocol**: `START:<bytes>:<filename>` → `CHUNK:<seq>:<base64>` (repeat) → `END:<crc32>`, each step ACK'd by device notify.

**ESP32 side:** GATT peripheral advertises, read returns config JSON, write updates `config_override.py` and triggers soft reset. Stops advertising during WiFi mode (resource conflict). Single book stored as `book.txt` / `position.txt` on flash.

**App side:** scans for "Lesefluss", auto-stops after 30s, reads/writes settings + position JSON, saves last connected device to SQLite. On connect, syncs position from device to active book in local DB.

## RSVP Algorithm

Both the ESP32 firmware and the companion app (when implemented) must use the same algorithm for reading parity:

- **Focal position (ORP):** calculated per word length (e.g., length 6–9 → position 2)
- **Base delay:** `60000 / WPM` milliseconds per word
- **Punctuation multipliers:** `DELAY_COMMA` for `,;:` - `DELAY_PERIOD` for `.!?` and long dashes
- **Acceleration:** start at `ACCEL_START` multiplier, decrease by `ACCEL_RATE` per word until 1.0
- **Word offset on resume:** scan backwards through file to find position N words earlier
- **Storage:** plain text `.txt` files, position saved as byte offset (not word index) for instant seeking

## Shared Settings

| Key | Range | Default | Description |
|-----|-------|---------|-------------|
| `wpm` | 100–1000 | 350 | Reading speed |
| `delay_comma` | 1.0–5.0 | 2.0 | Multiplier for `,;:` |
| `delay_period` | 1.0–5.0 | 3.0 | Multiplier for `.!?` and long dashes |
| `accel_start` | 1.0–5.0 | 2.0 | Initial speed multiplier (2.0 = half speed) |
| `accel_rate` | 0.05–1.0 | 0.1 | Rate to reach full speed (0.1 = 10 words) |
| `x_offset` | 30–70 | 50 | Focal letter horizontal position (%) |
| `focal_letter_color` | `#rrggbb` | `#ff0000` | Focal letter highlight color |
| `word_offset` | 0–20 | 5 | Words to rewind on resume |
| `inverse` | bool | false | Black on white when true |
| `ble_on` | bool | true | Enable BLE server |
| `brightness` | 10–100 | 100 | Backlight brightness (%) |
| `reader_theme` | dark/sepia/light | dark | Reading theme |
| `reader_font_size` | 12–28 | 17 | Reader font size (px) |
| `reader_font_family` | sans/serif | sans | Reader font family |
| `reader_line_spacing` | 1.2–2.4 | 1.8 | Reader line height multiplier |
| `reader_margin` | 8–48 | 20 | Reader horizontal padding (px) |

## Adding a New Setting

The wire-format mappers are registry-driven — `SYNCED_SETTING_KEYS` (sync) and
`ESP32_SETTING_KEYS` (BLE) in `packages/core/src/settings.ts` decide which
fields cross which boundary. You almost never need to touch the mapper code in
`apps/capacitor/src/services/sync/index.ts`, `apps/web/src/routes/api/sync.ts`,
or `apps/capacitor/src/services/ble/characteristics/settings.ts` — adding a key
to the right registry is enough.

Pick the scope first:

- **Synced** (cross-device, e.g. WPM, reader theme): goes through cloud sync.
- **Device-only** (only relevant on ESP32, e.g. `bleOn`, `brightness`): goes
  through BLE but never crosses the cloud boundary.
- **Local-only** (e.g. `onboardingCompleted`): lives in SQLite, nowhere else.

Then touch:

1. **`packages/core/src/settings.ts`** — add to `DEFAULT_SETTINGS`
   (UPPER_SNAKE) and, if it has a numeric range, `SETTING_CONSTRAINTS`.
2. **`packages/core/src/sync.ts`** — add to `SyncSettingsSchema`
   *(synced only)*.
3. **`packages/core/src/settings.ts`** — add the camelCase key to
   `SYNCED_SETTING_KEYS` *(synced)* and/or `ESP32_SETTING_KEYS`
   *(device-only or device+synced — map to the snake_case ESP32 name)*.
   The `satisfies` clause on `SYNCED_SETTING_KEYS` will fail compile if it
   drifts from `SyncSettingsSchema`.
4. **`apps/capacitor/src/services/db/schema.ts`** — add the column with a
   default that matches `DEFAULT_SETTINGS`.
5. **`apps/capacitor/drizzle/000N_<name>.sql`** + add an entry to
   `meta/_journal.json` — `ALTER TABLE settings ADD COLUMN …`.
6. **`apps/capacitor/src/services/db/queries/settings.ts`** — add the field to
   the `defaults` object in `getSettings()`.
7. **`apps/web/src/db/schema.ts`** + **`apps/web/drizzle/000N_<name>.sql`** —
   *synced only*. Mirror the column with the Postgres equivalent type.
8. **UI** — pick the right page:
   - RSVP speed/algorithm: `apps/capacitor/src/pages/settings/rsvp-settings-form.tsx`
   - Reader appearance: `apps/capacitor/src/pages/settings/appearance.tsx`
     (and `apps/capacitor/src/pages/reader/appearance-popover.tsx` if it
     should be tunable from inside the reader)
   - ESP32 device controls: `apps/capacitor/src/pages/settings/device.tsx`
9. **ESP32 firmware** *(device-only or device+synced)*:
   - `apps/esp32/src/config.py` — add the constant + default.
   - `apps/esp32/main.py` — add the key name to `_OVERRIDE_KEYS`.
   - `apps/esp32/src/ble/handler_settings.py` — extend `_build_json()`,
     `_apply_json()`, and `_persist()` to round-trip the field.

Mapper code (`sync/index.ts`, `routes/api/sync.ts`,
`ble/characteristics/settings.ts`) iterates over the registries and does **not**
need editing.

## Roadmap

Feature roadmap below. For publishing, Play Store, and monetisation see `agents/roadmap.md`.

### Phase 1 - BLE Integration ✅
- [x] Settings UI matching ESP32 options
- [x] SQLite database setup
- [x] BLE connection (app side)
- [x] ESP32 BLE server implementation
- [x] End-to-end testing

### Phase 2 - Book Library ✅
- [x] Book import (TXT, EPUB → plain text)
- [x] Local book library with metadata list
- [x] Navigation restructure (Library as home, BLE badge in tab bar)

### Phase 3 - Device Integration ✅
- [x] Upload active book to ESP32 (chunked BLE file transfer)
- [x] "Set active on device" action in Library UI + progress dialog
- [x] `BookSyncContext` (active book tracking, position sync on connect)
- [x] Bidirectional position sync (Position characteristic, read/write)
- [x] Extended BLE protocol (File Transfer + Position characteristics)
- [x] ESP32: single-book model (`book.txt`/`position.txt`), remove slot logic
- [x] Display remaining space on ESP32 in the app
- [x] ESP32 deletes current book on receiving START: (frees flash before new content is written)
- [x] Extend transfer dialog: confirmation modal with book size, free space estimate, replacement warning

### Phase 4 - Enhanced Features
- [x] Simple Epub reader
- [x] Reader progress bar (tap/drag to scrub)
- [x] Chapter / TOC navigation (EPUB books)
- [x] Reading themes (dark / light)
- [x] Dictionary lookup (tap highlighted word)
- [x] Improve esp32: Add loading indicator when file transfer, improve "home page press boot" with actual nice homescreen
- [x] sync book title to esp32
- [x] Battery management: deep sleep
- [x] Dark theme for entire app
- [x] Esp32 brightness setting
- [x] Font family selection, line spacing, margins, sepia theme (reader appearance)
- [x] Punctuation break doesnt work sometimes?
- [x] display turns off during transfer
- [x] app back button and gesture (entire navigation) doesnt work on first time, needs to be pressed twice from reading to go back into library
- [x] esp32 word clearing issue, example: "blue-dragonfly-shine" -> "was". the first word is not fully cleared
- [x] Fix app dark mode action sheet
- [x] Fix pressing button  during transfer causing reading mode
- [x] Keep display on during transfer in app
- [x] closing app srolls the progress bar at the bottom
- [x] clicking a word twice (dict modal) should also have a magnify icon to automatically search for the selected word
- [x] search result click highlights the matched word
- [x] search modal last result unreachable (modal breakpoint snap-back)
- [ ] split long words into multiple in esp32
- [ ] special characters äüö not working in the rsvp esp32
- [ ] Check if wpm actually matches (maybe display delay slows things down)
- [ ] Partial book sync to esp32 to combat long upload times
- [ ] Recompile AMOLED firmware with larger NimBLE buffers (current RM67162 build drops BLE writes at window_size>2, ST7789 handles 4 fine - need to fork nspsck/RM67162_Micropython_QSPI and increase NimBLE buffer config in sdkconfig.board)
- [x] In-app RSVP reader (software parity with ESP32)
- [x] Cloud sync (full-snapshot, last-write-wins - books/settings/highlights via POST /api/sync)
- [x] Web app version (capacitor web build embedded at `/app` on website)
- [x] Desktop sidebar nav for web app (brand, Library, Settings)
- [x] Auto-save settings (optimistic update + debounced DB write, replaces draft-then-save)
- [x] Library sorting (title, author, recent, progress) & filtering (all, unread, reading, done)
- [x] Highlight text snippet stored at creation time (`text` column in highlights/sync_highlights - extracted from book content in reader, synced via HTTP)
- [x] `/profile` page on website (stats, library, highlights with snippets/notes)
- [x] `/account` page on website (change password, danger zone)
- [x] `/changelog` page on website (public changelog, river timeline - data in `apps/web/src/data/changelog.ts`)
- [ ] Advanced book management (tags, collections, search)
- [ ] Reading statistics
- [ ] Minifying the python code & merge to single file
- [ ] Updating the esp32 code from the capacitor app
- [ ] Battery management: indicator

## Future Ideas

**ESP32 Hardware:**
- Battery level display (requires voltage divider hardware mod - GPIO 4 ready on AMOLED)
- Page simulation (250 words per "page")
- Font size options
- Progress indicator during reading

**Companion App:**
- Reading goals and streaks
- Settings presets for different reading scenarios
- Social features (share progress, recommendations)

<!-- BACKLOG.MD MCP GUIDELINES START -->

<CRITICAL_INSTRUCTION>

## BACKLOG WORKFLOW INSTRUCTIONS

This project uses Backlog.md MCP for all task and project management activities.

**CRITICAL GUIDANCE**

- If your client supports MCP resources, read `backlog://workflow/overview` to understand when and how to use Backlog for this project.
- If your client only supports tools or the above request fails, call `backlog.get_backlog_instructions()` to load the tool-oriented overview. Use the `instruction` selector when you need `task-creation`, `task-execution`, or `task-finalization`.

- **First time working here?** Read the overview resource IMMEDIATELY to learn the workflow
- **Already familiar?** You should have the overview cached ("## Backlog.md Overview (MCP)")
- **When to read it**: BEFORE creating tasks, or when you're unsure whether to track work

These guides cover:
- Decision framework for when to create tasks
- Search-first workflow to avoid duplicates
- Links to detailed guides for task creation, execution, and finalization
- MCP tools reference

You MUST read the overview resource to understand the complete workflow. The information is NOT summarized here.

</CRITICAL_INSTRUCTION>

<!-- BACKLOG.MD MCP GUIDELINES END -->
