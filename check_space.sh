#!/bin/bash
# Check ESP32 filesystem usage

PORT="/dev/ttyUSB0"
VENV_ACTIVATE=".venv/bin/activate"

if [ -f "$VENV_ACTIVATE" ]; then
    source "$VENV_ACTIVATE"
fi

if ! command -v mpremote &> /dev/null; then
    echo "Error: mpremote not found"
    exit 1
fi

if [ ! -e "$PORT" ]; then
    echo "Error: Device not found at $PORT"
    exit 1
fi

echo "=== ESP32 Storage Info ==="
echo ""

# Run Python command to check filesystem stats
mpremote connect "$PORT" exec "
import os
stat = os.statvfs('/')
block_size = stat[0]
total_blocks = stat[2]
free_blocks = stat[3]
total_mb = (total_blocks * block_size) / (1024 * 1024)
free_mb = (free_blocks * block_size) / (1024 * 1024)
used_mb = total_mb - free_mb
print(f'Total: {total_mb:.2f} MB')
print(f'Used:  {used_mb:.2f} MB')
print(f'Free:  {free_mb:.2f} MB')
print(f'Usage: {(used_mb/total_mb)*100:.1f}%')
"

echo ""
echo "=== Files on ESP32 ==="
mpremote connect "$PORT" fs ls
