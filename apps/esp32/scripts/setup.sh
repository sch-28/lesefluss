#!/bin/bash
# Initial setup script for RSVP Reader
# Erases flash, reflashes firmware, installs toolchain, and uploads all files.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ESP32_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$ESP32_ROOT"

PORT="/dev/ttyUSB0"
VENV_ACTIVATE=".venv/bin/activate"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}=== RSVP Reader Initial Setup ===${NC}"

# ---------------------------------------------------------------------------
# Python toolchain
# ---------------------------------------------------------------------------
if [ -f "$VENV_ACTIVATE" ]; then
    echo -e "${GREEN}Activating virtual environment...${NC}"
    source "$VENV_ACTIVATE"
else
    echo -e "${YELLOW}No .venv found — creating one...${NC}"
    python3 -m venv .venv
    source "$VENV_ACTIVATE"
fi

echo -e "${GREEN}Installing Python dependencies...${NC}"
pip install -q -r requirements.txt

# ---------------------------------------------------------------------------
# Sanity checks
# ---------------------------------------------------------------------------
if ! command -v esptool &> /dev/null; then
    echo -e "${RED}Error: esptool not found. Install with: pip install esptool${NC}"
    exit 1
fi
if [ ! -e "$PORT" ]; then
    echo -e "${RED}Error: device not found at $PORT${NC}"
    exit 1
fi

# ---------------------------------------------------------------------------
# Flash firmware
# ---------------------------------------------------------------------------
echo -e "${YELLOW}This will ERASE the ESP32 flash and upload ALL files including firmware.${NC}"
echo -e "${YELLOW}Use upload.sh for quick updates after initial setup.${NC}"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 1
fi

echo -e "${GREEN}Erasing flash...${NC}"
esptool --port "$PORT" erase-flash

echo -e "${GREEN}Flashing MicroPython firmware...${NC}"
esptool --port "$PORT" --baud 460800 write-flash -z 0x1000 etc/ESP32_GENERIC-20251209-v1.27.0.bin

echo "Waiting for device to be ready..."
sleep 3

# ---------------------------------------------------------------------------
# Upload all files (including drivers on first run)
# ---------------------------------------------------------------------------
./scripts/upload.sh drivers

# Enable dev mode — device is still at REPL (upload.sh does not reset)
echo ""
echo "Enabling dev mode for development..."
mpremote connect "$PORT" exec "f = open('devmode', 'w'); f.write('1'); f.close()"

echo ""
echo -e "${GREEN}✓ Initial setup complete!${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Reset your ESP32 - it will boot into dev mode (REPL)"
echo "2. Or test manually: ./scripts/run.sh"
echo "3. For quick updates: ./scripts/upload.sh"
