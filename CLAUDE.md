# RSVP Project - Development Guide

Monorepo containing ESP32 RSVP hardware reader and mobile companion app.

## Project Structure

```
rsvp/
├── apps/
│   ├── esp32/          # MicroPython ESP32 hardware reader
│   └── capacitor/      # Mobile companion app (iOS/Android)
└── CLAUDE.md           # This file
```

## ESP32 Hardware Reader

**Location:** `apps/esp32/`

ESP32-based RSVP (Rapid Serial Visual Presentation) speed reader with ST7789 display.

### Key Features
- **Streaming word reader** - handles 1MB+ books without loading into RAM
- **Byte-based position saving** - instant resume from saved position
- **Word offset** - start N words before saved position when resuming (0-20, default 5)
- **Acceleration/ease-in** - starts slow and ramps up to full speed
- **Configurable focal offset** - position focal letter left/center/right (30-70%)
- **Inverse mode** - white-on-black or black-on-white display
- **Punctuation delays** - automatic pausing at commas, periods, etc.
- **4 book slots** - independent position tracking per book
- **WiFi AP mode** - web interface for uploads and settings
- **BLE ready** - `BLE_ON` config for companion app connectivity

### Hardware
- ESP32 with ST7789 display (170x320 physical, 240x320 driver with rotation=3)
- BOOT button (GPIO 0) for control
- 3.7V LiPo battery via JST 1.25mm connector (1000mAh tested)
- Onboard charging circuit (TP4056 or similar) - charges via USB

### Configuration
All settings in `src/config.py`, overridden by `config_override.py` on device:
- `WPM` - reading speed (100-1000, default 350)
- `DELAY_COMMA` / `DELAY_PERIOD` - punctuation pause multipliers
- `ACCEL_START` / `ACCEL_RATE` - ease-in acceleration
- `X_OFFSET` - horizontal focal position (30-70%, default 50=center)
- `WORD_OFFSET` - words to rewind on resume (0-20, default 5)
- `INVERSE` - color scheme (True=black on white)
- `BLE_ON` - enable BLE for companion app (default True)
- `CURRENT_SLOT` - active book slot (1-4)

### Memory Management (Critical for ESP32)
- **ESP32 has ~512KB RAM** - cannot load large files into memory
- `WordReader` class streams words one at a time from file
- Position saved as **byte offset** for instant seeking
- `gc.collect()` every 100 words prevents fragmentation
- HTML responses must stream line-by-line (can't send >3KB at once)

### Development Scripts
```bash
cd apps/esp32
./scripts/setup.sh              # First time: flash MicroPython + upload all
./scripts/upload.sh             # Upload only changed files (git diff)
./scripts/upload.sh no all      # Force upload all files
./scripts/run.sh                # Test run without reboot
```

### Button Controls
- **Short press**: start/pause/resume reading
- **Hold 5 seconds**: enter WiFi mode (AP "RSVP-Reader", 192.168.4.1)

See `apps/esp32/CLAUDE.md` for detailed technical notes.

---

## Capacitor Companion App

**Location:** `apps/capacitor/`

Mobile companion app for the ESP32 RSVP Reader hardware device.

### Purpose
Enhance the ESP32 RSVP reader with mobile book management, settings sync, and a software RSVP reading mode for devices without the hardware reader.

### Core Features (Planned)

**Device Integration**
- BLE/WiFi connection to ESP32 reader
- Sync reading settings (WPM, delays, acceleration, focal offset, inverse mode, word offset)
- Upload books to device (4 slots with position tracking)
- Monitor reading progress across slots

**Book Management**
- Import books (EPUB, TXT, PDF)
- Organize library with collections/tags
- Search and filter books
- Cloud backup and sync (optional)

**Mobile RSVP Reader**
- Software implementation of ESP32 reader features
- Focal letter highlighting with ORP (Optimal Recognition Point)
- Punctuation-aware delays
- Acceleration/ease-in on start/resume
- Position saving and word offset
- Configurable display (focal offset, inverse mode)
- Full settings parity with hardware device

**Settings Management**
- Configure all ESP32 settings via mobile UI
- Presets for different reading scenarios
- Sync settings bidirectionally with device

### Development
```bash
cd apps/capacitor
pnpm install
pnpm start
```

### Current Implementation

**Database (SQLite)** ✅
- Three tables: `devices`, `settings`, `books`
- Singleton service: `src/services/database.ts`
- DatabaseProvider context

**BLE Integration** ✅
- Service: `src/services/ble.ts` - scanning, connection, read/write
- Context: `src/contexts/BLEContext.tsx` - app-wide state
- UUIDs: `src/constants/ble.ts`
- Home page: device scanning and connection UI
- Settings page: bidirectional sync buttons

**UI** ✅
- Ionic React with monochrome theme
- Settings page with all ESP32 controls
- Home page with BLE connection and scanning
- Tab navigation (Reader/Settings)

### Roadmap

**Phase 1 (MVP) - BLE Integration**
- [x] Settings UI matching ESP32 options
- [x] SQLite database setup
- [x] BLE connection to ESP32 (App side complete)
- [ ] ESP32 BLE server implementation
- [ ] End-to-end testing

**Phase 2 - Device Integration**
- [ ] Book import (TXT, EPUB convert to TXT)
- [ ] Local book library
- [ ] Upload books to device
- [ ] Reading progress monitoring

**Phase 3 - Enhanced Features**
- [ ] Cloud sync
- [ ] Book reader (normal and RSVP modes)
- [ ] Web app version
- [ ] Advanced book management
- [ ] Reading statistics

---

## BLE Integration

### Architecture

**Service Structure:**
- Service UUID: `6e400001-b5a3-f393-e0a9-e50e24dcca9e`
- Settings Characteristic: `6e400002-b5a3-f393-e0a9-e50e24dcca9e` (read/write JSON)
- Device Name: "RSVP-Reader"
- Strategy: Single JSON characteristic with all settings (~100 bytes)

**Data Format:**
```json
{
  "wpm": 350, "delay_comma": 2.0, "delay_period": 3.0,
  "accel_start": 2.0, "accel_rate": 0.1, "x_offset": 50,
  "word_offset": 5, "inverse": false, "ble_on": true, "current_slot": 1
}
```

### App Side (Capacitor) ✅

**Completed:**
1. BLE service (`src/services/ble.ts`) - scan, connect, read/write
2. BLE context (`src/contexts/BLEContext.tsx`) - app-wide state
3. Home page - device scanning, connection UI, device list
4. Settings page - sync to/from device buttons

**Features:**
- Auto-stop scan after 30s
- Connection state tracking
- Device RSSI display
- Error handling and toasts
- Save last connected device to DB

### ESP32 Side (MicroPython) ✅

**Completed:**
1. BLE server module (`src/ble/server.py`)
   - BLE GATT peripheral with custom service
   - Advertises as "RSVP-Reader"
   - Characteristic read returns current config as JSON
   - Characteristic write parses JSON and updates config
   - Saves to `config_override.py` on write
2. Integration with main.py
   - BLE server starts automatically if `BLE_ON = True`
   - Runs alongside reading (non-blocking)
   - Stops advertising during WiFi mode (resource conflict)
   - Restarts advertising after WiFi mode exits
   - Checks for settings updates in both idle and reading loops
   - Soft reset triggered when settings updated
3. Integration with rsvp_reader.py
   - Accepts `ble_server` parameter in constructor
   - Checks for settings updates during reading loop
   - Returns 'restart' signal when settings changed
4. Config synchronization
   - Reads from config module on BLE read request
   - Writes to `config_override.py` on BLE write
   - Automatically reloads config via soft reset

**Features:**
- Auto-start BLE on boot if `BLE_ON = True`
- Low-power advertising when idle
- Graceful handling of WiFi/BLE conflicts
- Memory-efficient JSON serialization
- Error handling with full tracebacks
- Live settings updates during reading (triggers restart)

**Memory Management:**
- `gc.collect()` before/after BLE operations
- JSON payload ~100 bytes (well under 512 byte MTU)
- BLE stack uses ~30-40KB RAM

**Ready for Testing:**
- All code complete and integrated
- Upload scripts updated for monorepo
- Ready for hardware testing and end-to-end validation

---

## Key Technical Notes

### ESP32 MicroPython Specifics
- MicroPython doesn't support `from src import module` - add `src` to `sys.path`
- Both `boot.py` AND `main.py` run automatically on startup
- Binary file handling: write `'wb'`, read `'rb'` and decode for non-UTF8
- Socket cleanup critical: close properly + `gc.collect()` + 0.2s delay between requests

### RSVP Algorithm (for companion app parity)
- **Focal position** (ORP): Calculated per word length (e.g., length 6-9 → position 2)
- **Base delay**: `60000 / WPM` milliseconds per word
- **Punctuation multipliers**: Apply to base delay
- **Acceleration**: Start at `ACCEL_START` multiplier, decrease by `ACCEL_RATE` per word
- **Word offset on resume**: Scan backwards through file to find position N words earlier

### File Format
- **Storage**: Plain text files (`.txt`)
- **Position**: Byte offset (not word index) for instant seeking
- **Size limits**: ESP32 tested with 1MB+ books via streaming

---

## Development Workflow

### Working on ESP32
1. Make code changes in `apps/esp32/`
2. Run `./upload.sh` to upload only changed files
3. Device auto-restarts and applies changes
4. Use dev mode to prevent auto-start during development

### Working on Companion App
1. Make changes in `apps/capacitor/`
2. Run `pnpm start` for hot reload development
3. Use BLE simulator/mock for testing without hardware
4. Test with real ESP32 device for integration

### Testing BLE Integration
1. Enable BLE on ESP32 via web interface (`BLE_ON` checkbox)
2. Launch companion app
3. Scan for nearby devices
4. Connect and verify settings sync both ways
5. Test disconnect/reconnect handling

---

## Battery & Power Management

### Current Hardware Status

**Battery Setup:**
- 3.7V 1000mAh LiPo with JST 1.25mm connector
- Onboard charging circuit (TP4056 or similar)
- Blue LED indicates charging (on when USB + battery connected)
- Charges at ~4.2V (full) down to 3.0V (empty, nominal 3.7V)

**Charging Behavior:**
- ✅ Battery charges when USB connected
- ✅ Battery powers device when USB disconnected  
- ✅ Charging IC monitors voltage internally for safety
- ❌ **No built-in voltage monitoring for ESP32** (tested GPIO 34, 35, 36, 39 - all read 0V)

**Board does NOT have:**
- Voltage divider circuit for battery level monitoring
- Any GPIO connection to battery voltage
- Software-accessible battery percentage reading

### Battery Monitoring Options

#### Option A: Add External Voltage Divider (Recommended)
**Hardware modification required** to enable battery level display.

**What you need:**
- 2× 100kΩ resistors (matched pair)
- Soldering iron and thin wire

**Connection:**
```
Battery+ (JST pad) ──[100kΩ]──┬──[100kΩ]── GND
                              │
                           GPIO35
```

**Why voltage divider is needed:**
- LiPo voltage range: 3.0V - 4.2V (too high for ESP32 ADC)
- ESP32 ADC safe range: 0V - 3.3V
- Divider cuts voltage in half: 1.5V - 2.1V (safe!)

**Implementation plan:**
1. Solder voltage divider to board
2. Create `src/battery_monitor.py` - ADC reading and percentage calculation
3. Modify `src/display_manager.py` - add battery icon drawing
4. Integrate battery checks in `src/rsvp_reader.py`
5. Add battery settings to web interface

**Features when implemented:**
- Real-time battery percentage (0-100%)
- Battery icon on pause screen (top-left)
- Low battery warning (configurable threshold)
- Critical battery auto-save and sleep

#### Option B: Deep Sleep Only (No Battery Display)
**No hardware modification needed** - implement power saving without monitoring.

**Features:**
- Deep sleep on idle timeout (configurable, e.g., 30s or 5min)
- Wake on BOOT button press
- Auto-save position before sleep
- Massive power savings (~80mA active → ~20μA deep sleep)

**Implementation plan:**
1. Add deep sleep config to `src/config.py`
2. Modify `src/rsvp_reader.py` - handle sleep timeout
3. Modify `main.py` - deep sleep entry and wake detection
4. Configure GPIO 0 (BOOT) as wake source

#### Option C: Software Battery Estimation (Inaccurate)
**No hardware modification** - estimate based on runtime.

**How it works:**
- Track reading time
- Estimate battery drain based on usage
- Very rough approximation (~2h active = 25% consumed)

**Cons:**
- Inaccurate (doesn't account for battery age, temperature, actual usage)
- Can't detect actual battery voltage
- Not recommended

### Power Consumption Estimates

**Active reading:** ~80-120mA
- Display backlight: ~40-60mA
- ESP32 active: ~30-50mA
- ST7789 driver: ~10-20mA

**Current idle (display off):** ~20-40mA
- ESP32 awake but idle
- Significant battery drain

**Deep sleep:** ~10-20μA
- ESP32 in deep sleep mode
- Only RTC and wake logic active
- ~1000x less power than idle!

**Battery life estimates (1000mAh battery):**
- Active reading: ~8-10 hours
- Current idle: ~25-50 hours
- Deep sleep: ~2000-4000 hours (months!)

### Recommended Approach

**Phase 1 (Immediate):**
- Implement deep sleep for massive power savings
- No hardware modification needed
- Works today

**Phase 2 (When you get resistors):**
- Add voltage divider for battery monitoring
- Enable battery percentage display
- Add low battery warnings

This gives you immediate power savings while leaving room for battery display later.

---

## Future Enhancements

### Hardware
- Page simulation (250 words per "page")
- Font size options
- Progress indicator during reading
- Battery level display
- Chapter detection and navigation

### Companion App
- Reading statistics and analytics
- Reading goals and streaks
- Social features (share progress, recommendations)
- Advanced book management (tags, collections, search)
- Cross-device sync (read on phone, continue on ESP32)
- Web app version (PWA)

---

For detailed technical documentation:
- ESP32: See `apps/esp32/CLAUDE.md`
- Capacitor: See `apps/capacitor/README.md`
