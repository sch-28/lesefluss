"""
BLE Storage Characteristic Handler

Read-only characteristic that exposes ESP32 flash storage usage.

Protocol:
  Read → {"free_bytes": <int>, "total_bytes": <int>}

Uses os.statvfs('/') which reports the flash filesystem (littlefs).
  statvfs result: (f_bsize, f_frsize, f_blocks, f_bfree, f_bavail, ...)
  total_bytes = f_frsize * f_blocks
  free_bytes  = f_frsize * f_bfree
"""

import gc
import json
import os


class StorageHandler:
    def __init__(self, ble, handle):
        """
        Args:
            ble:    bluetooth.BLE instance (shared with server)
            handle: GATT attribute handle for the storage characteristic
        """
        self.ble = ble
        self.handle = handle
        # Pre-fill buffer so it's valid before first read request
        self._refresh()

    # ------------------------------------------------------------------
    # Read path
    # ------------------------------------------------------------------

    def on_read_request(self):
        """Refresh GATT buffer with current storage stats."""
        gc.collect()
        self._refresh()
        gc.collect()

    def _refresh(self):
        try:
            stat = os.statvfs("/")
            block_size = stat[1]   # f_frsize
            total = block_size * stat[2]  # f_blocks
            free  = block_size * stat[3]  # f_bfree
        except Exception:
            total = 0
            free  = 0
        data = json.dumps({"free_bytes": free, "total_bytes": total}).encode("utf-8")
        self.ble.gatts_write(self.handle, data)
        print(f"[storage] read request → free={free} total={total}")
