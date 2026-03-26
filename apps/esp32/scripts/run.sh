#!/bin/bash
# Run script for RSVP Reader

set -e

PORT="/dev/ttyUSB0"
VENV_ACTIVATE=".venv/bin/activate"

# Activate virtual environment if it exists
if [ -f "$VENV_ACTIVATE" ]; then
    source "$VENV_ACTIVATE"
fi

# Check if mpremote is available
if ! command -v mpremote &> /dev/null; then
    echo "Error: mpremote not found. Install with: pip install mpremote"
    exit 1
fi

# Check if port exists
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
