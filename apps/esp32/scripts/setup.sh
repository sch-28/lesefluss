#!/bin/bash
# Initial setup script for RSVP Reader
# Erases flash, reflashes firmware, and uploads all files

set -e  # Exit on error

# Get the script directory and ESP32 app root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ESP32_ROOT="$(dirname "$SCRIPT_DIR")"

# Change to ESP32 directory for relative paths
cd "$ESP32_ROOT"

# Configuration
PORT="/dev/ttyUSB0"
VENV_ACTIVATE=".venv/bin/activate"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== RSVP Reader Initial Setup ===${NC}"

# Activate virtual environment if it exists
if [ -f "$VENV_ACTIVATE" ]; then
    echo -e "${GREEN}Activating virtual environment...${NC}"
    source "$VENV_ACTIVATE"
fi

# Check if esptool is available
if ! command -v esptool &> /dev/null; then
    echo -e "${RED}Error: esptool not found.${NC}"
    exit 1
fi

echo -e "${YELLOW}This will ERASE the ESP32 flash and upload ALL files including firmware.${NC}"
echo -e "${YELLOW}Use upload.sh for quick updates after initial setup.${NC}"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 1
fi

# Erase flash
echo -e "${GREEN}Erasing flash memory...${NC}"
esptool --port "$PORT" erase-flash

# Flash MicroPython firmware
echo -e "${GREEN}Flashing MicroPython firmware...${NC}"
esptool --port "$PORT" --baud 460800 write-flash -z 0x1000 etc/ESP32_GENERIC-20251209-v1.27.0.bin

# Wait for device to be ready
echo "Waiting for device to be ready..."
sleep 3

# Run upload script with drivers flag
./scripts/upload.sh yes all

# Enable dev mode for easy development
echo ""
echo "Enabling dev mode for development..."
mpremote connect "$PORT" exec "f = open('devmode', 'w'); f.write('1'); f.close()"

echo ""
echo -e "${GREEN}✓ Initial setup complete!${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Reset your ESP32 - it will auto-start with boot.py"
echo "2. Or test manually: mpremote connect $PORT run boot.py"
echo "3. For quick updates: ./upload.sh"
