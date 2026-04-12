#!/bin/bash
# Run main.py on the device without rebooting.
# Requires dev mode to be active on the device (boot.py drops to REPL).
#
# Usage: run.sh --board ST7789|AMOLED [--port /dev/ttyACM0]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ESP32_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$ESP32_ROOT"

PORT=""
BOARD=""
VENV_ACTIVATE=".venv/bin/activate"

while [[ "$#" -gt 0 ]]; do
    case "$1" in
        --board) BOARD="$2"; shift 2 ;;
        --port)  PORT="$2";  shift 2 ;;
        *) echo "Unknown argument: $1"; exit 1 ;;
    esac
done

if [[ "$BOARD" != "ST7789" && "$BOARD" != "AMOLED" ]]; then
    echo "Error: --board ST7789|AMOLED is required"
    echo "  Example: $0 --board ST7789"
    echo "  Example: $0 --board AMOLED"
    exit 1
fi

if [ -z "$PORT" ]; then
    if [ "$BOARD" = "AMOLED" ]; then
        PORT="/dev/ttyACM0"
    else
        PORT="/dev/ttyUSB0"
    fi
fi

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
