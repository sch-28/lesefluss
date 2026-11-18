"""
BLE Storage Characteristic Handler

Read-only characteristic that exposes ESP32 flash storage usage.

Protocol:
  Read → {"free_bytes": <int>, "total_bytes": <int>, "book_hash": <str>[, "title": <str>]}

`title` is the stored book's title, sent only when the book has one. It lets
the app find the book again after a re-import gave it a new library id.

Uses os.statvfs('/') which reports the flash filesystem (littlefs).
  statvfs result: (f_bsize, f_frsize, f_blocks, f_bfree, f_bavail, ...)
  total_bytes = f_frsize * f_blocks
  free_bytes  = f_frsize * f_bfree
"""

import gc
import json
import os

_HASH_FILE = "book.hash"
_TITLE_FILE = "book.title"
# One ATT read carries at most MTU - 1 = 511 bytes.
_MAX_PAYLOAD = 500


def _read_text(path):
    try:
        with open(path, "r") as f:
            return f.read().strip()
    except OSError:
        return ""


def build_payload(free, total, book_hash, title):
    """Storage JSON as bytes, the title shortened until it fits one read."""
    data = {"free_bytes": free, "total_bytes": total, "book_hash": book_hash}
    while True:
        if title:
            data["title"] = title
        else:
            data.pop("title", None)
        encoded = json.dumps(data).encode("utf-8")
        over = len(encoded) - _MAX_PAYLOAD
        if over <= 0 or not title:
            return encoded
        title = title[: max(0, len(title) - over)].rstrip()


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

        book_hash = _read_text(_HASH_FILE)
        title = _read_text(_TITLE_FILE) if book_hash else ""

        data = build_payload(free, total, book_hash, title)
        self.ble.gatts_write(self.handle, data)
        print(f"[storage] read request → free={free} total={total} book_hash={book_hash!r} title={title!r}")
