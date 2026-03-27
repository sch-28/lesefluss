#!/bin/bash
# Upload script for RSVP Reader
# Only uploads files that have changed (based on git diff)

set -e

# Get the script directory and ESP32 app root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ESP32_ROOT="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(cd "$ESP32_ROOT/../.." && pwd)"

# Change to ESP32 directory for relative paths
cd "$ESP32_ROOT"

PORT="/dev/ttyUSB0"
VENV_ACTIVATE=".venv/bin/activate"
UPLOAD_DRIVERS="${1:-no}"
UPLOAD_ALL="${2:-no}"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
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

# Get list of changed files (staged + unstaged + untracked)
# Run git from repo root, filter for apps/esp32/, then strip prefix
CHANGED_FILES=$(cd "$REPO_ROOT" && git diff --name-only HEAD 2>/dev/null | grep "^apps/esp32/" | sed 's|^apps/esp32/||' || true)
UNTRACKED_FILES=$(cd "$REPO_ROOT" && git ls-files --others --exclude-standard 2>/dev/null | grep "^apps/esp32/" | sed 's|^apps/esp32/||' || true)
ALL_CHANGED="$CHANGED_FILES"$'\n'"$UNTRACKED_FILES"

upload_file() {
    local src="$1"
    local dest="$2"
    echo -e "  ${GREEN}↑${NC} $src"
    mpremote connect "$PORT" fs cp "$src" "$dest"
}

should_upload() {
    local file="$1"
    if [ "$UPLOAD_ALL" = "all" ]; then
        return 0
    fi
    echo "$ALL_CHANGED" | grep -q "^$file$"
}

echo -e "${GREEN}Uploading changed files to ESP32 at $PORT...${NC}"

UPLOADED=0

# Upload drivers if requested
if [ "$UPLOAD_DRIVERS" = "yes" ]; then
    upload_file "etc/st7789.py" ":"
    upload_file "etc/vga1_16x32.py" ":"
    UPLOADED=$((UPLOADED + 2))
fi

# Create directories (fast, always do it)
mpremote connect "$PORT" fs mkdir src 2>/dev/null || true
mpremote connect "$PORT" fs mkdir src/wifi 2>/dev/null || true
mpremote connect "$PORT" fs mkdir src/ble 2>/dev/null || true

# Root files
for file in boot.py main.py web_template.html; do
    if should_upload "$file"; then
        upload_file "$file" ":"
        UPLOADED=$((UPLOADED + 1))
    fi
done

# src files
for file in src/*.py; do
    if should_upload "$file"; then
        upload_file "$file" ":src/"
        UPLOADED=$((UPLOADED + 1))
    fi
done

# wifi module files
for file in src/wifi/*.py; do
    if should_upload "$file"; then
        upload_file "$file" ":src/wifi/"
        UPLOADED=$((UPLOADED + 1))
    fi
done

# ble module files
for file in src/ble/*.py; do
    if should_upload "$file"; then
        upload_file "$file" ":src/ble/"
        UPLOADED=$((UPLOADED + 1))
    fi
done

if [ $UPLOADED -eq 0 ]; then
    echo -e "${YELLOW}No changes detected. Use './upload.sh no all' to force upload all.${NC}"
else
    echo -e "${GREEN}✓ Uploaded $UPLOADED file(s)${NC}"
fi

echo ""
echo "To run: mpremote connect $PORT run main.py"
