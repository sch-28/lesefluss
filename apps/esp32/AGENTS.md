# ESP32 RSVP Reader

MicroPython firmware for ESP32 + ST7789 display. Shows books word-by-word with focal letter highlighting, acceleration, and WiFi/BLE management.

For project overview, roadmap, and shared settings see `../../agents.md`.

## Hardware

- ESP32 + ST7789 display — physically 170x320, driver 240x320, `rotation=3`
- BOOT button on GPIO 0 (only physical control)
- 3.7V LiPo via JST 1.25mm, onboard charging (TP4056), charges via USB
- No voltage divider on board — battery monitoring requires hardware mod (see Battery section)

## File Structure

```
boot.py              # Devmode check, auto-start main
main.py              # Main app loop, hardware init, BLE start
web_template.html    # WiFi web UI template (streamed line-by-line)
scripts/
  setup.sh           # First-time: flash MicroPython + upload all
  upload.sh          # Upload only changed files (git diff)
  run.sh             # Test run without reboot
src/
  config.py          # All settings with defaults
  display_manager.py # ST7789 ops, inverse mode, focal letter drawing
  button_handler.py  # Debounced short/long press detection
  rsvp_reader.py     # Core reading loop, acceleration, BLE check
  text_storage.py    # TextStorage + WordReader (streaming)
  ble/
    server.py        # GATT peripheral, advertise, read/write JSON
  wifi/
    __init__.py      # WiFiManager, AP mode setup
    server.py        # HTTP server, socket polling
    handlers.py      # Route handlers, HTML streaming
    utils.py         # log(), parse_post_data, display ref
etc/
  st7789.py          # Display driver
  vga1_16x32.py      # Font
  ESP32_GENERIC-*.bin # MicroPython firmware
```

## Key Classes

**WordReader** (`src/text_storage.py`)
- Streams words one at a time — never loads full file into RAM
- `open(byte_position)` — seeks instantly to saved position
- `next_word()` — returns next word with buffering
- `get_position()` — current byte offset for saving
- Buffer capped at 1000 chars with error recovery

**TextStorage** (`src/text_storage.py`)
- Saves/loads books and per-slot byte positions
- `load_position(word_offset)` — optionally rewinds N words on resume
- `.bak` backup system prevents position corruption on write failure

**RSVPReader** (`src/rsvp_reader.py`)
- Main reading loop with pause/resume
- Acceleration ease-in: starts at `ACCEL_START` multiplier, decreases by `ACCEL_RATE` per word
- `gc.collect()` every 100 words to prevent fragmentation
- Checks BLE for settings updates mid-reading, returns `'restart'` on change

**BLE Server** (`src/ble/server.py`)
- GATT peripheral, advertises as "RSVP-Reader"
- Read → current config as JSON; Write → update `config_override.py` + soft reset
- Stops advertising during WiFi mode (resource conflict), restarts after

**WiFiManager** (`src/wifi/`)
- AP "RSVP-Reader", no password, IP `192.168.4.1`
- HTML template streamed line-by-line (sending >3KB at once times out)
- Upload books, change all settings, toggle dev mode, select book slot

## Configuration

Settings in `src/config.py`, device overrides in `config_override.py`. Settings persist across reboots. Changeable via web UI or BLE.

See shared settings table in `../../agents.md`.

## Button Controls

- **Short press** — start / pause / resume (pause screen shows position %)
- **Hold 5s** — enter WiFi mode (AP "RSVP-Reader" at 192.168.4.1)

## Dev Mode

Create `devmode` file on device (or toggle via web UI). Boot shows "DEV MODE" and skips auto-start — safe for uploading code without the reader interfering.

## MicroPython Gotchas

- `from src import module` does **not** work — must add `src` to `sys.path`
- Both `boot.py` and `main.py` run automatically on startup
- Binary files: write with `'wb'`, read with `'rb'` then decode (handles non-UTF8)
- Socket cleanup is fragile — always `close()` + `gc.collect()` + 0.2s delay between requests
- Use `round()` not `//` for position percentage (avoids off-by-one)
- Never load large files into memory — always use `WordReader` streaming

## Memory (~512KB RAM)

| Component | Usage |
|-----------|-------|
| BLE stack | ~30–40KB |
| WordReader buffer | ~1KB |
| JSON payload | ~100 bytes |
| Everything else | remaining, managed with gc.collect() |

Call `gc.collect()` before/after BLE ops and every 100 words during reading.

## Battery & Power

**Current state:** no voltage monitoring (GPIO 34/35/36/39 all read 0V — no voltage divider on board). Blue LED indicates charging when USB connected.

**To add battery level display:** solder 2x 100kΩ resistors as voltage divider: `Battery+ → [100kΩ] → GPIO35 → [100kΩ] → GND`. Halves 3.0–4.2V to 1.5–2.1V (safe for ESP32 ADC).

**Power consumption (1000mAh battery):**

| Mode | Draw | Battery life |
|------|------|-------------|
| Active reading | ~80–120mA | ~8–10h |
| Idle (display off) | ~20–40mA | ~25–50h |
| Deep sleep | ~10–20μA | months |

Deep sleep (wake on GPIO 0) is not yet implemented.

## Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| Shows sample text after upload | Binary read failed | Use `'rb'` mode + decode |
| Position not resuming | Byte offset not saved | Check `.pos` file contents |
| WiFi page times out | HTML sent in one block | Stream template line-by-line |
| Memory error on large books | File loaded into RAM | Use `WordReader` streaming |
| Upload fails silently | Socket not cleaned up | `gc.collect()` + 0.2s delay |
| Position file deleted | OOM during save | `gc.collect()` before file write |
