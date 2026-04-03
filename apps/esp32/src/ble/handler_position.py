"""
BLE Position Characteristic Handler

Owns bidirectional read/write of the current byte-offset in book.txt.

Protocol:
  Read  → {"position": <int>}   (device is authoritative on connect)
  Write → {"position": <int>}   (app pushes position when reading in-app)

Storage: position.txt — a single ASCII integer, same file TextStorage uses.
"""

import gc
import json


_POSITION_FILE = "position.txt"


class PositionHandler:
    def __init__(self, ble, handle):
        """
        Args:
            ble:    bluetooth.BLE instance (shared with server)
            handle: GATT attribute handle for the position characteristic
        """
        self.ble = ble
        self.handle = handle
        self._updated = False

    def check_updated(self):
        """Return True once after a position write was received, then reset."""
        if self._updated:
            self._updated = False
            return True
        return False

    # ------------------------------------------------------------------
    # Read path
    # ------------------------------------------------------------------

    def on_read_request(self):
        """Refresh GATT buffer with current position from position.txt."""
        gc.collect()
        pos = self._read_position()
        data = json.dumps({"position": pos}).encode("utf-8")
        self.ble.gatts_write(self.handle, data)
        print(f"[position] read request → {pos}")
        gc.collect()

    def _read_position(self):
        try:
            with open(_POSITION_FILE, "r") as f:
                return int(f.read().strip())
        except Exception:
            return 0

    # ------------------------------------------------------------------
    # Write path
    # ------------------------------------------------------------------

    def on_write(self):
        """Called when the app writes a new position."""
        gc.collect()
        raw = self.ble.gatts_read(self.handle)
        try:
            data = json.loads(raw.decode("utf-8"))
            pos = int(data.get("position", 0))
            self._write_position(pos)
            self._updated = True
            print(f"[position] write → {pos}")
        except Exception as e:
            import sys
            print(f"[position] parse error: {e}")
            sys.print_exception(e)
        gc.collect()

    def _write_position(self, pos):
        try:
            with open(_POSITION_FILE, "w") as f:
                f.write(str(pos))
        except Exception as e:
            print(f"[position] file write error: {e}")
