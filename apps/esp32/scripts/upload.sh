#!/bin/bash
# Upload script for RSVP Reader
# Compiles src/**/*.py to .mpy bytecode, then pushes everything to the device.
# Does NOT reset the device — use run.sh to start the app.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ESP32_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$ESP32_ROOT"

PORT="/dev/ttyUSB0"
VENV_ACTIVATE=".venv/bin/activate"
DIST_DIR="dist"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}=== RSVP Reader Upload ===${NC}"

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
# 1. Compile src/**/*.py → dist/src/**/*.mpy
# ---------------------------------------------------------------------------
echo -e "${GREEN}Compiling src/ to .mpy...${NC}"

rm -rf "$DIST_DIR"
find src -name "*.py" | while read -r pyfile; do
    destdir="$DIST_DIR/$(dirname "$pyfile")"
    mkdir -p "$destdir"
    mpy-cross -march=xtensa "$pyfile" -o "$destdir/$(basename "${pyfile%.py}.mpy")"
    echo -e "  ${GREEN}✓${NC} $pyfile"
done

# ---------------------------------------------------------------------------
# 2. Push everything to the device
# ---------------------------------------------------------------------------
echo -e "${GREEN}Uploading to ESP32 at $PORT...${NC}"

# Drivers (only on first run / firmware reflash)
if [ "$1" = "drivers" ]; then
    echo -e "  ${GREEN}↑${NC} drivers"
    mpremote connect "$PORT" fs cp etc/st7789.py ":"
    mpremote connect "$PORT" fs cp etc/vga1_16x32.py ":"
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

# Root files (entry points — must stay as .py)
for f in boot.py main.py; do
    echo -e "  ${GREEN}↑${NC} $f"
    mpremote connect "$PORT" fs cp "$f" ":"
done

# Compiled src tree
echo -e "  ${GREEN}↑${NC} src/ (compiled .mpy)"
mpremote connect "$PORT" fs cp -r "$DIST_DIR/src/" ":src/"

echo ""
echo -e "${GREEN}✓ Uploaded. Use ./scripts/run.sh to start the app.${NC}"
