# T-Display-S3 AMOLED Migration Plan

Migration from the original ESP32 + ST7789 SPI display to the LilyGO T-Display-S3 AMOLED (RM67162, QSPI).

Both hardware variants are supported in a single codebase via a `HARDWARE` constant in `config.py`.

---

## Hardware Comparison

| Aspect               | ST7789 (original)         | T-Display-S3 AMOLED       |
|----------------------|---------------------------|---------------------------|
| MCU                  | ESP32 (Xtensa LX6)        | ESP32-S3 (Xtensa LX7)     |
| Display driver       | ST7789 (4-wire SPI)       | RM67162 (QSPI)            |
| Display resolution   | 170×320 px (visible)      | 240×536 px (full AMOLED)  |
| Display interface    | Standard SPI              | Quad-SPI (4 data lines)   |
| Backlight            | PWM on GPIO 32            | Software brightness (AMOLED, no PWM pin) |
| Buttons              | GPIO 0 (BOOT)             | GPIO 0 + GPIO 21          |
| Battery ADC          | No divider (reads 0V)     | GPIO 4 has voltage divider |
| Flash                | ESP32_GENERIC firmware    | Custom RM67162 firmware (see below) |
| mpy-cross arch       | `-march=xtensa`           | `-march=xtensawin`        |

---

## Display Driver

The RM67162 QSPI driver is provided by:
**https://github.com/nspsck/RM67162_Micropython_QSPI**

This is a C extension baked into a custom MicroPython firmware binary. Key points:

- The `rm67162` Python module has a similar API to `st7789` — `fill`, `fill_rect`, `hline`, `vline`, `text`, `colorRGB`, `brightness`, `init`, `rotation`, etc.
- The same `vga1_16x32.py` bitmap font works unchanged.
- The pre-built `firmware.bin` is in the repo's `firmware/` directory. The full C source (`rm67162/rm67162.c`) is available to inspect or build yourself.
- The driver wraps Espressif's official `esp_lcd` IDF API — not a homebrew QSPI implementation.
- **Newer board revision note:** GPIO 38 must be set HIGH before init or the display stays blank. The README confirms this.

---

## AMOLED Burn-in

AMOLED panels can get permanent burn-in from static high-brightness content. The RSVP use case (fixed indicator lines, high-brightness focal letter) is moderate risk for long sessions.

Mitigations already in place:
- Auto-dim + deep sleep on idle (display blanked before deep sleep)
- Word-by-word rendering means the focal letter position shifts constantly

Additional mitigations to implement:
- **Default brightness 60%** instead of 100% for AMOLED variant
- The red indicator lines (fixed-position vlines above/below focal letter) are the highest burn-in risk — make them configurable or skip on AMOLED

---

## Dual-Hardware Strategy

A single `HARDWARE` constant in `config.py` selects the active variant. All pin constants and display geometry are set inside an `if/else` block, so the rest of the codebase reads flat constants and never needs to branch.

```python
# config.py
HARDWARE = "AMOLED"  # or "ST7789"

if HARDWARE == "AMOLED":
    PIN_SCK          = 47
    PIN_CS           = 6
    PIN_DC           = 7
    PIN_RESET        = 17
    PIN_LED          = 38   # must be HIGH for display to work
    PIN_QSPI_D0      = 18
    PIN_QSPI_D1      = 7
    PIN_QSPI_D2      = 48
    PIN_QSPI_D3      = 5
    PIN_BOOT_BUTTON  = 0
    DISPLAY_WIDTH    = 536
    DISPLAY_HEIGHT   = 240
    DISPLAY_Y_OFFSET = 0
    DISPLAY_ROTATION = 1
    DISPLAY_PHYSICAL_HEIGHT = 240
    BRIGHTNESS       = 60   # lower default for AMOLED longevity
else:  # ST7789
    PIN_SCK          = 18
    PIN_MOSI         = 23
    PIN_BACKLIGHT    = 32
    PIN_RESET        = 4
    PIN_CS           = 15
    PIN_DC           = 2
    PIN_BOOT_BUTTON  = 0
    DISPLAY_WIDTH    = 240
    DISPLAY_HEIGHT   = 320
    DISPLAY_Y_OFFSET = 35
    DISPLAY_ROTATION = 3
    DISPLAY_PHYSICAL_HEIGHT = 170
    BRIGHTNESS       = 100
```

`display.py` branches on `config.HARDWARE` once during `__init__` to select the driver and init sequence. Everything else (`homescreen.py`, `rsvp.py`, BLE handlers, etc.) is untouched.

---

## Files to Change

### 1. `etc/` — firmware and driver

| Action | File |
|--------|------|
| Add | `firmware-amoled.bin` — downloaded from nspsck/RM67162_Micropython_QSPI |
| Keep | `ESP32_GENERIC-20251209-v1.27.0.bin` — for ST7789 boards |
| Keep | `vga1_16x32.py` — same font, works on both |
| Note | `st7789.py` is only uploaded for ST7789 boards (no longer needed for AMOLED) |

### 2. `src/config.py`

- Add `HARDWARE = "AMOLED"` constant at top
- Replace flat pin/geometry constants with `if HARDWARE == "AMOLED": ... else: ...` block
- Lower default `BRIGHTNESS` to 60 for AMOLED
- Remove `DISPLAY_BAUDRATE` from AMOLED branch (QSPI clock is set in driver init, not via `machine.SPI`)

### 3. `src/hw/display.py`

- Replace ST7789/SPI init with RM67162/QSPI init, gated on `config.HARDWARE`
- Remove `machine.PWM` backlight — replace with `self.display.brightness(pct)` for AMOLED
- `shutdown()` → `display.brightness(0)` + `display.disp_off()` for AMOLED
- `wakeup()` → `display.brightness(config.BRIGHTNESS)` + `display.disp_on()` for AMOLED
- Color helper: `st7789.color565(r,g,b)` → `rm67162.colorRGB(r,g,b)` for AMOLED (driver handles byte order internally)
- Set GPIO 38 HIGH before init for AMOLED

```python
# display.py — init branch
if config.HARDWARE == "AMOLED":
    import rm67162
    machine.Pin(config.PIN_LED, machine.Pin.OUT).value(1)  # required on newer boards
    hspi = machine.SPI(2, sck=machine.Pin(config.PIN_SCK), mosi=None, miso=None)
    panel = rm67162.QSPIPanel(
        spi=hspi,
        data=(machine.Pin(config.PIN_QSPI_D0), machine.Pin(config.PIN_QSPI_D1),
              machine.Pin(config.PIN_QSPI_D2), machine.Pin(config.PIN_QSPI_D3)),
        dc=machine.Pin(config.PIN_DC),
        cs=machine.Pin(config.PIN_CS),
        pclk=80_000_000,
        width=config.DISPLAY_HEIGHT,   # panel width/height are portrait-native
        height=config.DISPLAY_WIDTH,
    )
    self.display = rm67162.RM67162(panel, reset=machine.Pin(config.PIN_RESET))
    self.display.init()
    self.display.rotation(config.DISPLAY_ROTATION)
    self.display.brightness(config.BRIGHTNESS)
else:
    import st7789
    self.spi = machine.SPI(2, baudrate=config.DISPLAY_BAUDRATE, ...)
    self._bl_pwm = machine.PWM(machine.Pin(config.PIN_BACKLIGHT), freq=1000)
    self.display = st7789.ST7789(self.spi, ...)
```

### 4. `src/app/homescreen.py`

- The layout coordinates are hardcoded for 320×170 visible area
- Need to update for 536×240 on AMOLED — title, progress bar, stats, and hint y-positions
- Use `display.width` / `display.height` (already used for centering) so it's mostly correct; only fixed `y` values need updating
- Could be made fully dynamic using `config.DISPLAY_PHYSICAL_HEIGHT` fractions

### 5. `scripts/setup.sh`

Two paths based on a `--board` argument (or separate scripts):

```bash
# ST7789 (original):
esptool --port "$PORT" write-flash -z 0x1000 etc/ESP32_GENERIC-20251209-v1.27.0.bin

# AMOLED:
esptool --port "$PORT" write-flash 0 etc/firmware-amoled.bin
```

Also: for AMOLED, skip uploading `st7789.py` in the `drivers` step.

### 6. `scripts/upload.sh`

```bash
# ST7789 (ESP32 LX6):
mpy-cross -march=xtensa "$pyfile"

# AMOLED (ESP32-S3 LX7):
mpy-cross -march=xtensawin "$pyfile"
```

The active arch should follow from a `--board` argument or a local `.board` file that records which hardware is connected.

### 7. `apps/esp32/AGENTS.md`

- Update hardware section to document both variants
- Add note about `HARDWARE` constant as the single toggle

---

## Implementation Order

1. Download `firmware-amoled.bin` from nspsck/RM67162_Micropython_QSPI into `etc/`
2. Update `src/config.py` — add `HARDWARE` + split pin/geometry blocks
3. Update `src/hw/display.py` — dual-driver init, unified API surface
4. Update `src/app/homescreen.py` — dynamic layout coordinates
5. Update `scripts/setup.sh` — board-aware flash command
6. Update `scripts/upload.sh` — board-aware mpy-cross arch
7. Update `apps/esp32/AGENTS.md`
8. Flash AMOLED firmware, upload code, test

---

## What Does NOT Change

- All BLE code (`src/ble/`) — completely unchanged
- All reader code (`src/reader/`) — completely unchanged
- `src/app/__init__.py` (App state machine) — unchanged
- `src/hw/button.py` — unchanged (GPIO 0 is the same on both boards)
- `vga1_16x32.py` font — same format, works on both drivers
- BLE protocol, companion app — unchanged
- `boot.py`, `main.py` — unchanged
