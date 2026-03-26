# RSVP Reader - Development Notes

## Project Overview

ESP32-based RSVP (Rapid Serial Visual Presentation) reader with ST7789 display. Shows words one at a time at configurable speeds with focal letter highlighting.

## Hardware

- ESP32 with ST7789 display
- Display is physically 170x320 but uses 240x320 driver settings with rotation=3
- BOOT button (GPIO 0) is the only control

## Key Technical Discoveries

### MicroPython Specifics
- MicroPython doesn't support `from src import module` - need to add `src` to `sys.path`
- MicroPython runs BOTH `boot.py` AND `main.py` on startup automatically
- Devmode check needed in both boot.py and main.py

### Memory Constraints
- ESP32 has ~512KB RAM available for MicroPython
- **Cannot load large files (1MB+) into memory** - causes silent failures
- Solution: `WordReader` class streams words one at a time from file
- Position saved as **byte offset** (not word index) for instant seeking

### WiFi/HTTP Handling
- Large file uploads require streaming - can't load into memory
- HTML response streaming required - sending >3KB HTML in one go times out
- Must stream line by line from template file
- Binary file upload: write with `'wb'` mode, read with `'rb'` and decode to handle non-UTF8 chars
- Socket timeouts: ESP32 WiFi stack is fragile; need proper socket cleanup, gc.collect(), and 0.2s delay between requests

### Position/Percentage
- Use `round()` instead of `//` to avoid off-by-one errors in position percentage
- Store byte position (not word index) for instant file seeking
- Percentage calculated from byte_position / file_size

## Architecture

### File Structure
```
boot.py              - Devmode check, auto-start main
main.py              - Main app loop, hardware init
web_template.html    - HTML with {placeholders}
src/
  config.py          - Settings (WPM, delays, pins)
  display_manager.py - ST7789 display operations
  button_handler.py  - Debounced button with short/long press
  rsvp_reader.py     - Core reading loop with WordReader
  text_storage.py    - TextStorage + WordReader classes
  wifi/
    __init__.py      - WiFiManager (AP mode)
    server.py        - HTTP server with socket polling
    handlers.py      - Route handlers, HTML streaming
    utils.py         - Helpers: log(), parse_post_data, etc.
```

### Key Classes

**WordReader** (text_storage.py)
- Streams words from large files without loading into memory
- `open(byte_position)` - opens file and seeks to position
- `next_word()` - returns next word, handles buffering
- `get_position()` - returns current byte position for saving

**RSVPReader** (rsvp_reader.py)
- Main reading loop with pause/resume
- Uses WordReader for files, simple list for sample text
- Saves byte position on pause

**WiFiManager** (wifi/__init__.py)
- Creates AP "RSVP-Reader" (no password)
- Delegates to Server for HTTP handling

### Web Interface
- Pure HTML aesthetic (no fancy CSS)
- Tables, `<hr>` separators, black/white default look
- Template placeholders: `{current_percent}`, `{book_size}`, `{selected_1}`, etc.
- Streamed line-by-line to avoid memory issues

## Button Controls

- **Short press during idle**: Start reading
- **Short press during reading**: Pause/resume
- **Hold 5 seconds**: Enter WiFi mode

## Dev Mode

- When `devmode` file exists on device, boot.py shows "DEV MODE" and doesn't auto-start
- Toggle via web interface or manually create/delete file
- Useful for development - prevents reader from starting while uploading code

## Scripts

- `setup.sh` - First-time setup (flash MicroPython + upload all)
- `upload.sh` - Upload code changes (calls setup.sh for drivers)
- `run.sh` - Test run with force_run=True (bypasses devmode)

## Common Issues & Solutions

1. **Book shows sample text after upload**: File wasn't saved correctly or load_text() failed silently. Check binary read mode.

2. **Position not resuming**: Check that position file exists and contains byte offset (not word index).

3. **WiFi page times out**: HTML too large, need to stream line-by-line from template.

4. **Memory error on large books**: Must use WordReader streaming, not load_text().

5. **Upload fails silently**: Check for socket cleanup, add gc.collect(), ensure 0.2s delay between requests.

## Display Logging

`log(msg)` function in `wifi/utils.py`:
- Prints to serial console
- Shows on display (truncated to 20 chars)
- Set display reference with `set_display(display)`
