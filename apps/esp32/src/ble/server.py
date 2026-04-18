"""
BLE Server for Lesefluss ESP32

Thin coordinator layer - owns:
  - bluetooth.BLE instance
  - GATT service registration (4 characteristics)
  - Advertising lifecycle
  - IRQ dispatch to per-characteristic handlers

Characteristic handlers live in separate modules:
  handler_settings.py      - settings JSON read/write
  handler_position.py      - byte-offset read/write
  handler_file_transfer.py - chunked book upload state machine
  handler_storage.py       - flash storage info (read-only)

UUIDs sourced from ble_config.py (auto-generated from packages/ble-config/config.json).
Run `pnpm setup:project` from the monorepo root to regenerate after UUID changes.
"""

import bluetooth
import gc
from micropython import const

from .ble_config import (
    DEVICE_NAME,
    FILE_TRANSFER_CHAR_UUID,
    POSITION_CHAR_UUID,
    SERVICE_UUID,
    SETTINGS_CHAR_UUID,
    STORAGE_CHAR_UUID,
)
from .handler_file_transfer import FileTransferHandler
from .handler_position import PositionHandler
from .handler_settings import SettingsHandler
from .handler_storage import StorageHandler

# BLE IRQ event constants
_IRQ_CENTRAL_CONNECT    = const(1)
_IRQ_CENTRAL_DISCONNECT = const(2)
_IRQ_GATTS_WRITE        = const(3)
_IRQ_GATTS_READ_REQUEST = const(4)
_IRQ_MTU_EXCHANGED      = const(21)

# Characteristic flags
_FLAG_READ              = const(0x0002)
_FLAG_WRITE_NO_RESPONSE = const(0x0004)
_FLAG_WRITE             = const(0x0008)
_FLAG_NOTIFY            = const(0x0010)

_BLE_MTU = const(512)


class BLEServer:
    """BLE GATT Server - coordinates advertising and delegates characteristic I/O."""

    def __init__(self, config_module, name=DEVICE_NAME):
        """
        Args:
            config_module: live config module (config.py defaults + config_override.py)
            name:          BLE advertised device name
        """
        self.config = config_module
        self.name   = name

        self.ble = bluetooth.BLE()
        self.ble.active(True)
        self.ble.config(mtu=_BLE_MTU)
        # Increase the BLE receive ring buffer so the sliding-window chunk
        # transfer (WINDOW_SIZE writes in flight) doesn't overflow.  Silently
        # ignored if the firmware build doesn't support it.
        try:
            self.ble.config(rxbuf=2048)
        except Exception:
            pass
        self.ble.irq(self._irq_handler)

        self.connected   = False
        self.conn_handle = None
        self._needs_advertising = False

        self._register_service()
        self.start_advertising()

        print(f"[ble] server started: {name}")

    # ------------------------------------------------------------------
    # GATT service registration
    # ------------------------------------------------------------------

    def _register_service(self):
        services = ((
            bluetooth.UUID(SERVICE_UUID),
            (
                (bluetooth.UUID(SETTINGS_CHAR_UUID),      _FLAG_READ | _FLAG_WRITE),
                (bluetooth.UUID(FILE_TRANSFER_CHAR_UUID), _FLAG_WRITE_NO_RESPONSE | _FLAG_NOTIFY),
                (bluetooth.UUID(POSITION_CHAR_UUID),      _FLAG_READ | _FLAG_WRITE),
                (bluetooth.UUID(STORAGE_CHAR_UUID),       _FLAG_READ),
            ),
        ),)

        ((
            settings_handle,
            file_transfer_handle,
            position_handle,
            storage_handle,
        ),) = self.ble.gatts_register_services(services)

        # Pre-fill buffers so reads before first write return valid data
        self.ble.gatts_write(settings_handle,      bytes(512))
        self.ble.gatts_write(file_transfer_handle, bytes(512))
        self.ble.gatts_write(position_handle,      bytes(64))
        self.ble.gatts_write(storage_handle,       bytes(64))

        # Instantiate handlers, passing a lambda so file_transfer can notify
        # without holding a direct reference to this server object
        self.settings      = SettingsHandler(self.ble, settings_handle, self.config)
        self.position      = PositionHandler(self.ble, position_handle)
        self.file_transfer = FileTransferHandler(
            self.ble, file_transfer_handle,
            conn_handle_ref=lambda: self.conn_handle,
        )
        self.storage       = StorageHandler(self.ble, storage_handle)

        print(
            f"[ble] service registered - handles: "
            f"settings={settings_handle}, "
            f"file_transfer={file_transfer_handle}, "
            f"position={position_handle}, "
            f"storage={storage_handle}"
        )

    # ------------------------------------------------------------------
    # IRQ dispatcher
    # ------------------------------------------------------------------

    def _irq_handler(self, event, data):
        if event == _IRQ_CENTRAL_CONNECT:
            conn_handle, _, _ = data
            self.connected   = True
            self.conn_handle = conn_handle
            print(f"[ble] IRQ connected: handle {conn_handle}")

        elif event == _IRQ_CENTRAL_DISCONNECT:
            conn_handle, _, _ = data
            self.connected   = False
            self.conn_handle = None
            print(f"[ble] IRQ disconnected: handle {conn_handle}")
            # Don't restart advertising inside the IRQ - the BLE stack may
            # not have finished cleaning up the old connection yet, causing
            # the next connection attempt to fail.  Set a flag and let the
            # main loop call start_advertising() after a short delay.
            self._needs_advertising = True

        elif event == _IRQ_GATTS_WRITE:
            _, attr_handle = data
            if attr_handle == self.settings.handle:
                self.settings.on_write()
            elif attr_handle == self.file_transfer.handle:
                self.file_transfer.on_write()
            elif attr_handle == self.position.handle:
                self.position.on_write()

        elif event == _IRQ_GATTS_READ_REQUEST:
            _, attr_handle = data
            print(f"[ble] IRQ read: handle {attr_handle}")
            if attr_handle == self.settings.handle:
                self.settings.on_read_request()
            elif attr_handle == self.position.handle:
                self.position.on_read_request()
            elif attr_handle == self.storage.handle:
                self.storage.on_read_request()

        elif event == _IRQ_MTU_EXCHANGED:
            conn_handle, mtu = data
            print(f"[ble] MTU exchanged: conn={conn_handle} mtu={mtu}")

        else:
            print(f"[ble] IRQ unknown event: {event}")

    # ------------------------------------------------------------------
    # Advertising
    # ------------------------------------------------------------------

    def start_advertising(self):
        """Start advertising (reactivates BLE if it was stopped for WiFi mode)."""
        if not self.ble.active():
            print("[ble] reactivating BLE...")
            self.ble.active(True)
            self._register_service()

        name_bytes = self.name.encode("utf-8")
        payload = bytes([
            0x02, 0x01, 0x06,
            len(name_bytes) + 1, 0x09,
        ]) + name_bytes

        self.ble.gap_advertise(100_000, adv_data=payload)
        print(f"[ble] advertising: {self.name}")

    def stop_advertising(self):
        self.ble.gap_advertise(None)
        print("[ble] advertising stopped")

    # ------------------------------------------------------------------
    # Public API for main loop
    # ------------------------------------------------------------------

    def get_transfer_progress(self):
        """Return (in_progress, bytes_received, expected_size) from the file-transfer handler."""
        return self.file_transfer.get_progress()

    def is_connected(self):
        return self.connected

    def poll(self):
        """Call from the main loop. Restarts advertising after a disconnect."""
        if self._needs_advertising:
            self._needs_advertising = False
            import time
            # Stop any stale advertising, wait for the BLE stack to fully
            # release the old connection, then restart cleanly.
            self.ble.gap_advertise(None)
            time.sleep_ms(500)
            gc.collect()
            self.start_advertising()

    def check_position_updated(self):
        """True once after the app wrote a new position via BLE."""
        return self.position.check_updated()

    def check_settings_updated(self):
        """True once after settings were written by the app."""
        return self.settings.check_updated()

    def check_transfer_completed(self):
        """True once after a book transfer finished successfully."""
        return self.file_transfer.check_completed()

    def deinit(self):
        gc.collect()
        if self.connected and self.conn_handle is not None:
            self.ble.gap_disconnect(self.conn_handle)
        self.stop_advertising()
        self.ble.active(False)
        print("[ble] server deinitialized")
        gc.collect()
