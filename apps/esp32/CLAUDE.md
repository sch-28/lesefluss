# RSVP Reader - Development Notes

## Project Overview

ESP32-based RSVP (Rapid Serial Visual Presentation) reader with ST7789 display. Shows words one at a time at configurable speeds with focal letter highlighting, acceleration, and customizable display options.

## Hardware

- ESP32 with ST7789 display
- Display is physically 170x320 but uses 240x320 driver settings with rotation=3
- BOOT button (GPIO 0) is the only control

## Key Features

- **Streaming word reader** - handles 1MB+ books without loading into RAM
- **Byte-based position saving** - instant resume from saved position
- **Word offset** - start N words before saved position when resuming (0-20, default 5)
- **Acceleration/ease-in** - starts slow and ramps up to full speed
- **Configurable focal offset** - position focal letter left/center/right (30-70%)
- **Inverse mode** - switch between white-on-black and black-on-white
- **Punctuation delays** - automatic pausing at commas, periods, etc.
- **4 book slots** - independent position tracking per book
- **On-screen logging** - see upload progress and settings changes in WiFi mode
- **Incremental upload** - only upload changed files (uses git diff)

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
- Periodic `gc.collect()` every 100 words prevents memory fragmentation
- Buffer overflow protection in WordReader (max 1000 chars)

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
upload.sh            - Incremental upload using git diff
src/
  config.py          - Settings (WPM, delays, pins, display options)
  display_manager.py - ST7789 display operations with inverse mode support
  button_handler.py  - Debounced button with short/long press
  rsvp_reader.py     - Core reading loop with WordReader and acceleration
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
- Buffer overflow protection and error recovery

**TextStorage** (text_storage.py)
- Handles saving/loading books and positions
- `load_position(word_offset)` - loads saved position and optionally goes back N words
- `_go_back_n_words()` - scans backwards through file to find position N words earlier
- Position backup system with `.bak` files to prevent corruption
- Verification after write to ensure position was saved correctly

**RSVPReader** (rsvp_reader.py)
- Main reading loop with pause/resume
- Uses WordReader for files, simple list for sample text
- Saves byte position on pause
- Implements acceleration (ease-in) with configurable rate
- Periodic garbage collection every 100 words
- Applies word offset when resuming reading

**WiFiManager** (wifi/__init__.py)
- Creates AP "RSVP-Reader" (no password)
- Delegates to Server for HTTP handling
- Sets up display logging

### Web Interface
- Pure HTML aesthetic (no fancy CSS)
- Tables, `<hr>` separators, black/white default look
- Template placeholders: `{current_percent}`, `{book_size}`, `{inverse_checked}`, `{word_offset}`, etc.
- Streamed line-by-line to avoid memory issues
- All settings configurable: WPM, delays, acceleration, offset, word offset, inverse mode

### Display Settings

**X_OFFSET (30-70%)**
- Controls horizontal position of focal letter
- 50% = center (default)
- 30% = more to the left
- 70% = more to the right

**INVERSE (True/False)**
- False = white text on black (default)
- True = black text on white
- Inverts all colors including focal letter and indicators

**WORD_OFFSET (0-20)**
- Number of words to go back when resuming reading
- Default: 5 words
- Helps avoid missing context when resuming
- Scans backwards through file using 2KB buffer for efficiency
- If not enough words in buffer, goes to start of chunk

**Acceleration**
- `ACCEL_START` - initial delay multiplier (2.0 = start at half speed)
- `ACCEL_RATE` - how fast to reach full speed (0.1 = 10 words)
- Resets to 0 on pause

## Button Controls

- **Short press during idle**: Start reading
- **Short press during reading**: Pause/resume (shows position %)
- **Hold 5 seconds**: Enter WiFi mode

## Dev Mode

- When `devmode` file exists on device, boot.py shows "DEV MODE" and doesn't auto-start
- Toggle via web interface or manually create/delete file
- Useful for development - prevents reader from starting while uploading code

## Scripts

- `setup.sh` - First-time setup (flash MicroPython + upload all)
- `upload.sh` - Incremental upload (only changed files via git diff)
  - `./upload.sh` - upload changed files
  - `./upload.sh no all` - force upload all files
- `run.sh` - Test run with force_run=True (bypasses devmode)

## Common Issues & Solutions

1. **Book shows sample text after upload**: File wasn't saved correctly or load_text() failed silently. Check binary read mode.

2. **Position not resuming**: Check that position file exists and contains byte offset (not word index).

3. **WiFi page times out**: HTML too large, need to stream line-by-line from template.

4. **Memory error on large books**: Must use WordReader streaming, not load_text().

5. **Upload fails silently**: Check for socket cleanup, add gc.collect(), ensure 0.2s delay between requests.

6. **WordReader read error**: Check for buffer overflow, file corruption, or memory issues. Errors logged with full traceback.

7. **Position file deleted**: Memory issues during save. Added gc.collect() before file writes.

## Display Logging

`log(msg)` function in `wifi/utils.py`:
- Prints to serial console
- Shows on display (truncated to 20 chars)
- Set display reference with `set_display(display)`
- Used for upload progress, settings changes, etc.

## Configuration

All settings stored in `config_override.py` on device:
- WPM (100-1000)
- DELAY_COMMA, DELAY_PERIOD (1.0-5.0)
- ACCEL_START (1.0-5.0), ACCEL_RATE (0.05-1.0)
- X_OFFSET (30-70)
- WORD_OFFSET (0-20)
- INVERSE (True/False)
- CURRENT_SLOT (1-4)

Settings persist across reboots and can be changed via web interface.
