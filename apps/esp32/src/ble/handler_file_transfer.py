"""
BLE File Transfer Characteristic Handler

Implements the chunked book upload state machine.

Protocol (app → device, device notifies ACK/NACK back):

  App writes:   START:<total_bytes>:<filename>
  Device notif: ACK:START  |  NACK:<reason>

  App writes:   CHUNK:<seq_4digit>:<base64_data>
  Device notif: ACK:<seq>  |  NACK:<seq>:<reason>

  App writes:   END:<crc32_hex>
  Device notif: ACK:END  |  NACK:END:<reason>

On ACK:END  → book.tmp renamed to book.txt, position.txt reset to 0,
              `completed` flag set so main loop reloads the reader.
On any error → book.tmp deleted, state reset (app must restart from START).

Memory strategy: each chunk is decoded and written to book.tmp immediately —
nothing accumulates in RAM beyond a single chunk at a time.
"""

import gc
import binascii


_BOOK_FILE  = "book.txt"
_TEMP_FILE  = "book.tmp"
_POS_FILE   = "position.txt"
_HASH_FILE  = "book.hash"


class FileTransferHandler:
    def __init__(self, ble, handle, conn_handle_ref):
        """
        Args:
            ble:              bluetooth.BLE instance (shared with server)
            handle:           GATT attribute handle for the file_transfer characteristic
            conn_handle_ref:  callable that returns current conn_handle (or None)
                              — needed so we can notify without coupling to BLEServer
        """
        self.ble = ble
        self.handle = handle
        self._get_conn_handle = conn_handle_ref

        # State machine
        self._reset()

    # ------------------------------------------------------------------
    # Public flag (polled by main loop)
    # ------------------------------------------------------------------

    def check_completed(self):
        """Returns True once after a successful transfer."""
        if self.completed:
            self.completed = False
            return True
        return False

    # ------------------------------------------------------------------
    # Write handler (called from server IRQ)
    # ------------------------------------------------------------------

    def on_write(self):
        gc.collect()
        raw = self.ble.gatts_read(self.handle)
        try:
            msg = raw.decode("utf-8").rstrip("\n")
        except Exception:
            self._nack("DECODE_ERR")
            return

        if msg.startswith("START:"):
            self._handle_start(msg)
        elif msg.startswith("CHUNK:"):
            self._handle_chunk(msg)
        elif msg.startswith("END:"):
            self._handle_end(msg)
        else:
            print(f"[transfer] unknown message: {msg[:40]}")
            self._nack("UNKNOWN")
        gc.collect()

    # ------------------------------------------------------------------
    # State machine steps
    # ------------------------------------------------------------------

    def _handle_start(self, msg):
        # START:<total_bytes>:<filename>
        try:
            _, total_str, filename = msg.split(":", 2)
            total = int(total_str)
        except Exception:
            print(f"[transfer] bad START: {msg[:60]}")
            self._nack("BAD_START")
            return

        # Clean up any previous temp file and the current book so flash is
        # freed before we start writing — the old book is gone from this point.
        self._delete_temp()
        self._delete_book()
        self._reset()

        self.expected_size = total
        self.filename = filename
        self.in_progress = True
        self.temp_file = open(_TEMP_FILE, "wb")

        print(f"[transfer] START — {filename}, {total} bytes")
        self._ack("START")

    def _handle_chunk(self, msg):
        # CHUNK:<seq>:<base64_data>
        if not self.in_progress:
            self._nack("NOT_STARTED")
            return

        try:
            _, seq_str, b64 = msg.split(":", 2)
            seq = int(seq_str)
        except Exception:
            print(f"[transfer] bad CHUNK header: {msg[:60]}")
            self._nack("BAD_CHUNK")
            return

        # Sequence check (gaps not supported — app must resend missing chunk)
        if seq != self.next_seq:
            print(f"[transfer] seq mismatch: expected {self.next_seq}, got {seq}")
            self._nack(f"{seq_str}:SEQ_ERR")
            return

        try:
            chunk = binascii.a2b_base64(b64)
        except Exception as e:
            print(f"[transfer] base64 decode error seq {seq}: {e}")
            self._nack(f"{seq_str}:B64_ERR")
            return

        try:
            self.temp_file.write(chunk)
        except Exception as e:
            print(f"[transfer] file write error seq {seq}: {e}")
            self._abort("WRITE_ERR")
            return

        self.bytes_received += len(chunk)
        self.crc = binascii.crc32(chunk, self.crc)
        self.next_seq += 1

        print(f"[transfer] CHUNK {seq} ok ({self.bytes_received}/{self.expected_size})")
        self._ack(seq_str)

    def _handle_end(self, msg):
        # END:<crc32_hex>
        if not self.in_progress:
            self._nack("END:NOT_STARTED")
            return

        try:
            _, crc_hex = msg.split(":", 1)
            expected_crc = int(crc_hex, 16)
        except Exception:
            print(f"[transfer] bad END: {msg[:60]}")
            self._nack("END:BAD_END")
            return

        # Flush and close temp file before integrity checks
        try:
            self.temp_file.flush()
            self.temp_file.close()
            self.temp_file = None
        except Exception as e:
            print(f"[transfer] close temp error: {e}")
            self._abort("END:CLOSE_ERR")
            return

        # Size check — cheap sanity gate before the more expensive CRC comparison
        if self.bytes_received != self.expected_size:
            print(f"[transfer] size mismatch: got {self.bytes_received}, expected {self.expected_size}")
            self._delete_temp()
            self._reset()
            self._nack("END:SIZE")
            return

        # CRC is stored as unsigned 32-bit; binascii.crc32 may return signed on some builds
        actual_crc = self.crc & 0xFFFFFFFF
        if actual_crc != (expected_crc & 0xFFFFFFFF):
            print(f"[transfer] CRC mismatch: got {actual_crc:#010x}, expected {expected_crc:#010x}")
            self._delete_temp()
            self._reset()
            self._nack("END:CRC")
            return

        # Commit: rename temp → book.txt (old book already deleted at START)
        try:
            import os
            os.rename(_TEMP_FILE, _BOOK_FILE)
        except Exception as e:
            print(f"[transfer] rename error: {e}")
            self._abort("END:RENAME_ERR")
            return

        try:
            with open(_POS_FILE, "w") as f:
                f.write("0")
        except Exception as e:
            print(f"[transfer] position reset error: {e}")
            # Non-fatal — book is still committed

        # Write the book ID so the app can verify the right book is on the device
        try:
            with open(_HASH_FILE, "w") as f:
                f.write(self.filename)
        except Exception as e:
            print(f"[transfer] book.hash write error: {e}")
            # Non-fatal

        bytes_committed = self.bytes_received
        self._reset()
        # Set completed AFTER _reset() — _reset() clears it to False
        self.completed = True
        print(f"[transfer] END ok — {bytes_committed} bytes committed as book.txt")
        self._ack("END")

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _ack(self, token):
        self._notify(f"ACK:{token}")

    def _nack(self, reason):
        self._notify(f"NACK:{reason}")

    def _notify(self, msg):
        conn = self._get_conn_handle()
        if conn is None:
            print(f"[transfer] notify skipped (not connected): {msg}")
            return
        try:
            self.ble.gatts_notify(conn, self.handle, msg.encode("utf-8"))
            print(f"[transfer] notify → {msg}")
        except Exception as e:
            print(f"[transfer] notify error: {e}")

    def _abort(self, reason):
        """Close and delete temp file, reset state, send NACK."""
        if self.temp_file:
            try:
                self.temp_file.close()
            except Exception:
                pass
            self.temp_file = None
        self._delete_temp()
        self._reset()
        self._nack(reason)

    def _delete_temp(self):
        try:
            import os
            os.remove(_TEMP_FILE)
        except OSError:
            pass

    def _delete_book(self):
        """Remove the current book and its associated metadata files from flash."""
        import os
        for path in (_BOOK_FILE, _POS_FILE, _HASH_FILE):
            try:
                os.remove(path)
                print(f"[transfer] deleted {path}")
            except OSError:
                pass  # File didn't exist — that's fine

    def _reset(self):
        """Reset all transfer state. Called at init and after each transfer ends."""
        if hasattr(self, "temp_file") and self.temp_file:
            try:
                self.temp_file.close()
            except Exception:
                pass
        self.in_progress    = False
        self.temp_file      = None
        self.expected_size  = 0
        self.bytes_received = 0
        self.next_seq       = 0
        self.crc            = 0
        self.filename       = ""
        self.completed      = False
