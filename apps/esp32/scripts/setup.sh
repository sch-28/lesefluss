#!/bin/bash
# Initial setup script for RSVP Reader
# Erases flash, reflashes firmware, installs toolchain, and uploads all files.
#
# Usage: setup.sh --board ST7789|AMOLED [--port /dev/ttyUSB0]
#
# Firmware:
#   ST7789  — etc/ESP32_GENERIC-20251209-v1.27.0.bin  (included)
#   AMOLED  — etc/firmware-amoled.bin  (download manually before running)
#             Source: https://github.com/nspsck/RM67162_Micropython_QSPI
#             Go to Releases or the firmware/ directory and grab firmware.bin.
#             This is the official open-source MicroPython build for ESP32-S3 + RM67162.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ESP32_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$ESP32_ROOT"

PORT=""
BOARD=""
VENV_ACTIVATE=".venv/bin/activate"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
while [[ "$#" -gt 0 ]]; do
    case "$1" in
        --board) BOARD="$2"; shift 2 ;;
        --port)  PORT="$2";  shift 2 ;;
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

echo -e "${BLUE}=== RSVP Reader Initial Setup (${BOARD}) ===${NC}"

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
if [ "$BOARD" = "AMOLED" ] && [ ! -f "etc/firmware-amoled.bin" ]; then
    echo -e "${RED}Error: etc/firmware-amoled.bin not found.${NC}"
    echo "  Download from: https://github.com/nspsck/RM67162_Micropython_QSPI"
    echo "  (Releases page or firmware/ directory in the repo)"
    exit 1
fi

# ---------------------------------------------------------------------------
# Flash firmware
# ---------------------------------------------------------------------------
echo -e "${YELLOW}This will ERASE the flash and upload ALL files including firmware.${NC}"
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

echo "Waiting for device to re-enumerate..."
for i in $(seq 1 20); do
    [ -e "$PORT" ] && break
    sleep 1
done
if [ ! -e "$PORT" ]; then
    echo -e "${RED}Error: $PORT did not reappear after erase. Replug the device and retry.${NC}"
    exit 1
fi
sleep 1

echo -e "${GREEN}Flashing MicroPython firmware (${BOARD})...${NC}"
if [ "$BOARD" = "AMOLED" ]; then
    esptool --port "$PORT" write-flash 0 etc/firmware-amoled.bin
else
    esptool --port "$PORT" --baud 460800 write-flash -z 0x1000 etc/ESP32_GENERIC-20251209-v1.27.0.bin
fi

echo "Waiting for device to be ready..."
sleep 3

# ---------------------------------------------------------------------------
# Upload all files (including drivers on first run)
# ---------------------------------------------------------------------------
./scripts/upload.sh --board "$BOARD" --port "$PORT" --devmode drivers

echo ""
echo -e "${GREEN}✓ Initial setup complete! (${BOARD})${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Reset your device — it will boot into dev mode (REPL)"
echo "2. Or test manually: ./scripts/run.sh"
echo "3. For quick updates: ./scripts/upload.sh --board ${BOARD}"
