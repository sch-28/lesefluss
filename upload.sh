#!/bin/bash
# Upload script for RSVP Reader
# Uploads all files to ESP32

set -e

PORT="/dev/ttyUSB0"
VENV_ACTIVATE=".venv/bin/activate"
UPLOAD_DRIVERS="${1:-no}"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}=== RSVP Reader Upload Script ===${NC}"

if [ -f "$VENV_ACTIVATE" ]; then
    source "$VENV_ACTIVATE"
fi

if ! command -v mpremote &> /dev/null; then
    echo -e "${RED}Error: mpremote not found${NC}"
    exit 1
fi

if [ ! -e "$PORT" ]; then
    echo -e "${RED}Error: Device not found at $PORT${NC}"
    exit 1
fi

echo -e "${GREEN}Uploading files to ESP32 at $PORT...${NC}"

# Upload drivers if requested
if [ "$UPLOAD_DRIVERS" = "yes" ]; then
    echo "Uploading st7789.py (display driver)..."
    mpremote connect "$PORT" fs cp etc/st7789.py :
    
    echo "Uploading vga1_16x32.py (font)..."
    mpremote connect "$PORT" fs cp etc/vga1_16x32.py :
fi

# Create src directory
echo "Creating src directory..."
mpremote connect "$PORT" fs mkdir src 2>/dev/null || true
mpremote connect "$PORT" fs mkdir src/wifi 2>/dev/null || true

# Upload boot.py
echo "Uploading boot.py..."
mpremote connect "$PORT" fs cp boot.py :

# Upload main.py
echo "Uploading main.py..."
mpremote connect "$PORT" fs cp main.py :

echo "Uploading web_template.html..."
mpremote connect "$PORT" fs cp web_template.html :

# Upload all src files
echo "Uploading src files..."
for file in src/*.py; do
    filename=$(basename "$file")
    echo "  - $filename"
    mpremote connect "$PORT" fs cp "$file" :src/
done

# Upload wifi module files
echo "Uploading wifi module..."
for file in src/wifi/*.py; do
    filename=$(basename "$file")
    echo "  - wifi/$filename"
    mpremote connect "$PORT" fs cp "$file" :src/wifi/
done

echo -e "${GREEN}✓ Upload complete!${NC}"
echo ""
echo "The ESP32 will auto-start on next boot unless dev mode is enabled"
echo "To run manually: mpremote connect $PORT run main.py"
