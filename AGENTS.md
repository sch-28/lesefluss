# RSVP Project

Monorepo: ESP32 hardware speed reader + mobile companion app.

## Structure

```
rsvp/
├── apps/
│   ├── esp32/          # MicroPython ESP32 RSVP reader       → apps/esp32/agents.md
│   └── capacitor/      # Ionic React mobile companion app     → apps/capacitor/agents.md
├── packages/
│   └── ble-config/     # Shared BLE UUIDs (workspace package)
├── resources/
│   └── icon.svg        # Master app icon (1024×1024, edit this)
└── agents.md           # This file
```

## First-time setup

```bash
pnpm install
pnpm setup:project      # generates BLE config + Android icon PNGs from resources/icon.svg
```

## What It Does

Displays books word-by-word at configurable speed (RSVP — Rapid Serial Visual Presentation) on a handheld ESP32 device. The companion app manages your book library, syncs settings, and will eventually provide a software RSVP reader on your phone.

## Development

```bash
# Capacitor app
cd apps/capacitor
pnpm install
pnpm start          # Vite dev server at http://localhost:3000

# ESP32 firmware
cd apps/esp32
./scripts/setup.sh              # First time: flash MicroPython + upload all
./scripts/upload.sh             # Upload only changed files (git diff)
./scripts/upload.sh no all      # Force upload all files
./scripts/run.sh                # Test run without reboot
```

### Development Workflows

**ESP32:** edit in `apps/esp32/` → `./scripts/upload.sh` → device auto-restarts. Use dev mode (`devmode` file on device) to prevent auto-start while iterating.

**Capacitor:** edit in `apps/capacitor/` → hot reload via Vite. Use BLE simulator/mock without hardware. Test with real ESP32 for integration.

**BLE end-to-end:** enable BLE on ESP32 (`BLE_ON` checkbox in web UI) → launch companion app → scan → connect → verify bidirectional settings sync → test disconnect/reconnect.

## BLE Integration

Both apps communicate over BLE. This is the shared contract:

- Device name: `RSVP-Reader`
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

**Position payload**: `{ "position": 58203 }` — byte offset into `book.txt`.
Device is authoritative on connect; app can push position when reading in-app.

**File transfer protocol**: `START:<bytes>:<filename>` → `CHUNK:<seq>:<base64>` (repeat) → `END:<crc32>`, each step ACK'd by device notify.

**ESP32 side:** GATT peripheral advertises, read returns config JSON, write updates `config_override.py` and triggers soft reset. Stops advertising during WiFi mode (resource conflict). Single book stored as `book.txt` / `position.txt` on flash.

**App side:** scans for "RSVP-Reader", auto-stops after 30s, reads/writes settings + position JSON, saves last connected device to SQLite. On connect, syncs position from device to active book in local DB.

## RSVP Algorithm

Both the ESP32 firmware and the companion app (when implemented) must use the same algorithm for reading parity:

- **Focal position (ORP):** calculated per word length (e.g., length 6–9 → position 2)
- **Base delay:** `60000 / WPM` milliseconds per word
- **Punctuation multipliers:** `DELAY_COMMA` for `,;:` — `DELAY_PERIOD` for `.!?` and long dashes
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
| `word_offset` | 0–20 | 5 | Words to rewind on resume |
| `inverse` | bool | false | Black on white when true |
| `ble_on` | bool | true | Enable BLE server |

## Adding a New Setting

Touch these files in order:

1. **`apps/esp32/src/config.py`** — add the constant with its default value
2. **`apps/esp32/main.py`** — add the key name to `_OVERRIDE_KEYS`
3. **`apps/esp32/src/ble/handler_settings.py`**
   - `_build_json()` — include it in the payload (convert units if needed, e.g. ms → s)
   - `_apply_json()` — read it with `.get("key", self.config.KEY)` and assign to `self.config`
   - `_persist()` — add the `f"KEY = {self.config.KEY}\n"` line
4. **`apps/capacitor/src/services/db/schema.ts`** — add the column to the `settings` table
5. **`apps/capacitor/drizzle/`** — create `000N_description.sql` with `ALTER TABLE settings ADD COLUMN ...` and add an entry to `meta/_journal.json`
6. **`apps/capacitor/src/services/db/queries/settings.ts`** — add the field to the `defaults` object in `getSettings()`
7. **`apps/capacitor/src/utils/settings.ts`** — add to `DEFAULT_SETTINGS` and `SETTING_CONSTRAINTS`
8. **`apps/capacitor/src/services/ble/characteristics/settings.ts`** — add to `ESP32Settings` interface, read mapping, and write mapping
9. **`apps/capacitor/src/pages/settings.tsx`** — add the UI control (slider or toggle)

## Roadmap

### Phase 1 — BLE Integration ✅
- [x] Settings UI matching ESP32 options
- [x] SQLite database setup
- [x] BLE connection (app side)
- [x] ESP32 BLE server implementation
- [x] End-to-end testing

### Phase 2 — Book Library ✅
- [x] Book import (TXT, EPUB → plain text)
- [x] Local book library with metadata list
- [x] Navigation restructure (Library as home, BLE badge in tab bar)

### Phase 3 — Device Integration ✅
- [x] Upload active book to ESP32 (chunked BLE file transfer)
- [x] "Set active on device" action in Library UI + progress dialog
- [x] `BookSyncContext` (active book tracking, position sync on connect)
- [x] Bidirectional position sync (Position characteristic, read/write)
- [x] Extended BLE protocol (File Transfer + Position characteristics)
- [x] ESP32: single-book model (`book.txt`/`position.txt`), remove slot logic
- [x] Display remaining space on ESP32 in the app
- [x] ESP32 deletes current book on receiving START: (frees flash before new content is written)
- [x] Extend transfer dialog: confirmation modal with book size, free space estimate, replacement warning

### Phase 4 — Enhanced Features
- [x] Simple Epub reader
- [x] Reader progress bar (tap/drag to scrub)
- [x] Chapter / TOC navigation (EPUB books)
- [x] Reading themes (dark / light)
- [x] Dictionary lookup (tap highlighted word)
- [x] Improve esp32: Add loading indicator when file transfer, improve "home page press boot" with actual nice homescreen
- [x] sync book title to esp32
- [ ] Battery management: deep sleep
- [ ] Partial book sync to esp32 to combat long upload times
- [ ] In-app RSVP reader (software parity with ESP32)
- [ ] Cloud sync
- [ ] Web app version (PWA)
- [ ] Advanced book management (tags, collections, search)
- [ ] Reading statistics
- [ ] Minifying the python code & merge to single file
- [ ] Updating the esp32 code from the capacitor app
- [ ] Battery management: indicator

## Future Ideas

**ESP32 Hardware:**
- Deep sleep for power saving (wake on GPIO 0)
- Battery level display (requires voltage divider hardware mod)
- Page simulation (250 words per "page")
- Font size options
- Progress indicator during reading
- Chapter detection and navigation

**Companion App:**
- Reading goals and streaks
- Cross-device sync (read on phone, continue on ESP32)
- Settings presets for different reading scenarios
- Social features (share progress, recommendations)
