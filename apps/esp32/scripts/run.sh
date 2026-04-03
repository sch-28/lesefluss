#!/bin/bash
# Run main.py on the device without rebooting.
# Requires dev mode to be active on the device (boot.py drops to REPL).

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ESP32_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$ESP32_ROOT"

PORT="/dev/ttyUSB0"
VENV_ACTIVATE=".venv/bin/activate"

if [ -f "$VENV_ACTIVATE" ]; then
    source "$VENV_ACTIVATE"
fi

if ! command -v mpremote &> /dev/null; then
    echo "Error: mpremote not found. Install with: pip install mpremote"
    exit 1
fi

if [ ! -e "$PORT" ]; then
    echo "Error: Device not found at $PORT"
    exit 1
fi

mpremote connect "$PORT" exec "
import sys
sys.path.append('/src')
sys.path.append('src')
import main
# Force run even if devmode is enabled
main.main(force_run=True)
"
