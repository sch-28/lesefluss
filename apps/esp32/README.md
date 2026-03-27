# RSVP Reader

ESP32-based speed reader using RSVP (Rapid Serial Visual Presentation). Shows words one at a time with focal point highlighting.

## Hardware

- ESP32 with ST7789 display (170x320, uses 240x320 driver with rotation=3)
- BOOT button (GPIO 0) for control

## Features

- Adjustable WPM (words per minute) with acceleration/ease-in
- Focal letter highlighting (red letter with position markers)
- Punctuation-aware delays (longer pauses for periods, commas, etc.)
- 4 book slots with independent position saving
- WiFi AP mode with web interface for uploads and settings
- Streaming file support (handles large books, 1MB+)
- Configurable horizontal offset (left/center/right focal position)
- Inverse color mode (black on white)
- Dev mode for easy development
- On-screen logging in WiFi mode
- Pause screen with percentage indicator

## Structure

```
rsvp/
├── boot.py              # Startup, devmode check
├── main.py              # Main application
├── web_template.html    # Web interface template
├── upload.sh            # Upload code to ESP32
├── setup.sh             # First-time setup (flash + upload)
├── run.sh               # Test run with force_run
├── src/
│   ├── config.py        # Settings (WPM, delays, etc.)
│   ├── display_manager.py
│   ├── button_handler.py
│   ├── rsvp_reader.py
│   ├── text_storage.py  # TextStorage + WordReader (streaming)
│   └── wifi/            # WiFi and web server
│       ├── __init__.py  # WiFiManager
│       ├── server.py    # HTTP server with poll loop
│       ├── handlers.py  # Route handlers + HTML streaming
│       └── utils.py     # Helpers + log() for display output
└── etc/
    ├── st7789.py
    ├── vga1_16x32.py
    └── ESP32_GENERIC-*.bin
```

## Setup

First time (flashes MicroPython and uploads everything):
```bash
./scripts/setup.sh
```

Upload code changes only (uses git diff to only upload changed files):
```bash
./scripts/upload.sh          # Upload only changed files
./scripts/upload.sh no all   # Force upload all files
```

Test without rebooting:
```bash
./scripts/run.sh
```

## Usage

**Normal mode:**
- Short press BOOT: start reading / pause / resume
- Hold BOOT 5 seconds: enter WiFi mode

**WiFi mode:**
- ESP32 creates AP "RSVP-Reader" (no password)
- Connect and go to 192.168.4.1
- Upload text, change settings, select book slot
- On-screen feedback shows upload progress, settings changes
- Click "Exit WiFi Mode" to return to reading

**Dev mode:**
- Toggle via web interface or create `devmode` file on device
- Shows "DEV MODE" on screen, doesn't auto-start reader
- Allows easy file uploads without interruption

## Config

Settings in `src/config.py`, overridden by `config_override.py` on device:
- `WPM` - reading speed (default 350)
- `DELAY_COMMA` - multiplier for `,;:` (default 2.0x)
- `DELAY_PERIOD` - multiplier for `.!?` and long dashes (default 3.0x)
- `ACCEL_START` - initial speed multiplier for ease-in (default 2.0 = half speed)
- `ACCEL_RATE` - acceleration rate (default 0.1 = 10 words to full speed)
- `X_OFFSET` - horizontal focal position percentage (default 50 = center, 30-70 range)
- `WORD_OFFSET` - number of words to go back when resuming (default 5, range 0-20)
- `INVERSE` - inverse colors, black on white (default False)
- `CURRENT_SLOT` - active book slot (1-4)

## TODO

Done:
- [x] WiFi web interface for text upload
- [x] Multiple book slots (4)
- [x] Position saving per slot (byte-based for instant seek)
- [x] Punctuation delays
- [x] Dev mode toggle
- [x] Focal letter (ORP) highlighting
- [x] Percentage-based position selector
- [x] Streaming file upload (handles 1MB+ books)
- [x] Streaming word reader (no memory issues with large files)
- [x] Book sizes shown in slot selector
- [x] On-screen logging during WiFi mode
- [x] Acceleration/ease-in when starting or resuming
- [x] Configurable horizontal offset (left/center/right)
- [x] Inverse color mode
- [x] Pause screen with position percentage
- [x] Incremental upload (only changed files)
- [x] Word offset (start N words before saved position when resuming)

Future ideas:
- [ ] Page simulation (250 words per "page", show "Page 45 of 892")
- [ ] Font size options
- [ ] Progress indicator on display during reading
- [ ] Battery level display
- [ ] Chunk mode (show 2-3 words at a time for longer words)
- [ ] Chapter detection and navigation
