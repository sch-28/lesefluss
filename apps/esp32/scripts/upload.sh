#!/bin/bash
# Upload script for Lesefluss
# Compiles src/**/*.py to .mpy bytecode, then pushes everything to the device.
# Does NOT reset the device - use run.sh to start the app.
#
# Usage: upload.sh --board ST7789|AMOLED [--port /dev/ttyUSB0] [drivers]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ESP32_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$ESP32_ROOT"

PORT=""
BOARD=""
UPLOAD_DRIVERS=false
SET_DEVMODE=false
VENV_ACTIVATE=".venv/bin/activate"
DIST_DIR="dist"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
while [[ "$#" -gt 0 ]]; do
    case "$1" in
        --board)   BOARD="$2";          shift 2 ;;
        --port)    PORT="$2";           shift 2 ;;
        --devmode) SET_DEVMODE=true;    shift   ;;
        drivers)   UPLOAD_DRIVERS=true; shift   ;;
        *) echo -e "${RED}Unknown argument: $1${NC}"; exit 1 ;;
    esac
done

if [[ "$BOARD" != "ST7789" && "$BOARD" != "AMOLED" ]]; then
    echo -e "${RED}Error: --board ST7789|AMOLED is required${NC}"
    echo "  Example: $0 --board ST7789"
    echo "  Example: $0 --board AMOLED"
    exit 1
fi

# Default port per board (override with --port if needed)
if [ -z "$PORT" ]; then
    if [ "$BOARD" = "AMOLED" ]; then
        PORT="/dev/ttyACM0"   # ESP32-S3 USB CDC
    else
        PORT="/dev/ttyUSB0"   # ESP32 USB-to-UART (CP2102/CH340)
    fi
fi

# mpy-cross architecture per MCU family
if [ "$BOARD" = "AMOLED" ]; then
    MPY_ARCH="xtensawin"   # ESP32-S3 (Xtensa LX7)
else
    MPY_ARCH="xtensa"      # ESP32   (Xtensa LX6)
fi

echo -e "${BLUE}=== Lesefluss Upload (${BOARD}) ===${NC}"

if [ -f "$VENV_ACTIVATE" ]; then
    source "$VENV_ACTIVATE"
fi

if ! command -v mpremote &> /dev/null; then
    echo -e "${RED}Error: mpremote not found. Run: pip install -r requirements.txt${NC}"
    exit 1
fi
if ! command -v mpy-cross &> /dev/null; then
    echo -e "${RED}Error: mpy-cross not found. Run: pip install -r requirements.txt${NC}"
    exit 1
fi
if [ ! -e "$PORT" ]; then
    echo -e "${RED}Error: device not found at $PORT${NC}"
    exit 1
fi

# ---------------------------------------------------------------------------
# 1. Patch HARDWARE constant to match --board, then compile
# ---------------------------------------------------------------------------
echo -e "${GREEN}Setting HARDWARE = \"${BOARD}\" in src/config.py...${NC}"
sed -i "s/^HARDWARE = .*/HARDWARE = \"${BOARD}\"/" src/config.py

echo -e "${GREEN}Compiling src/ to .mpy (${MPY_ARCH})...${NC}"

rm -rf "$DIST_DIR"
find src -name "*.py" | while read -r pyfile; do
    destdir="$DIST_DIR/$(dirname "$pyfile")"
    mkdir -p "$destdir"
    mpy-cross -march="$MPY_ARCH" "$pyfile" -o "$destdir/$(basename "${pyfile%.py}.mpy")"
    echo -e "  ${GREEN}✓${NC} $pyfile"
done

# ---------------------------------------------------------------------------
# 2. Push everything to the device
# ---------------------------------------------------------------------------
echo -e "${GREEN}Uploading to device at $PORT...${NC}"

# Drivers (only on first run / firmware reflash)
if [ "$UPLOAD_DRIVERS" = true ]; then
    echo -e "  ${GREEN}↑${NC} drivers"
    if [ "$BOARD" = "ST7789" ]; then
        mpremote connect "$PORT" fs cp etc/st7789.py ":"   # baked into AMOLED firmware
        mpremote connect "$PORT" fs cp etc/vga1_16x32.py ":"
    else
        mpremote connect "$PORT" fs cp etc/vga1_16x32.py ":"
        mpremote connect "$PORT" fs cp etc/font_dejavu_24x40.py ":"
    fi
fi

# Clean old src/ on device (removes any leftover .py / .mpy files)
echo -e "  ${YELLOW}cleaning src/ on device...${NC}"
mpremote connect "$PORT" exec "
import os
def rmtree(d):
    try:
        for f in os.listdir(d):
            p = d + '/' + f
            try:
                os.remove(p)
            except:
                rmtree(p)
        os.rmdir(d)
    except:
        pass
rmtree('src')
"

# Root files (entry points - must stay as .py)
for f in boot.py main.py; do
    echo -e "  ${GREEN}↑${NC} $f"
    mpremote connect "$PORT" fs cp "$f" ":"
done

# devmode flag (prevents app auto-start on boot, safe to leave on during dev)
if [ "$SET_DEVMODE" = true ]; then
    echo "1" > /tmp/_rsvp_devmode
    mpremote connect "$PORT" fs cp /tmp/_rsvp_devmode ":devmode"
    rm /tmp/_rsvp_devmode
    echo -e "  ${GREEN}↑${NC} devmode"
fi

# Compiled src tree
echo -e "  ${GREEN}↑${NC} src/ (compiled .mpy)"
mpremote connect "$PORT" fs cp -r "$DIST_DIR/src/" ":src/"

echo ""
echo -e "${GREEN}✓ Uploaded. Use ./scripts/run.sh to start the app.${NC}"
