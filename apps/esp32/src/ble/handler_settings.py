"""
BLE Settings Characteristic Handler

Owns read/write of the RSVP settings JSON characteristic.
- Read  → serialise config module to JSON, write into GATT buffer
- Write → parse JSON, update config module, persist to config_override.py,
          set `updated` flag so main loop can trigger a reader restart
"""

import gc
import json
import os


class SettingsHandler:
    def __init__(self, ble, handle, config_module):
        """
        Args:
            ble:           bluetooth.BLE instance (shared with server)
            handle:        GATT attribute handle for the settings characteristic
            config_module: live config module (config.py / config_override.py merged)
        """
        self.ble = ble
        self.handle = handle
        self.config = config_module
        self.updated = False  # main loop polls this to restart reader

    # ------------------------------------------------------------------
    # Read path
    # ------------------------------------------------------------------

    def on_read_request(self):
        """Refresh the GATT buffer so the central reads fresh values."""
        gc.collect()
        data = self._build_json()
        self.ble.gatts_write(self.handle, data)
        print(f"[settings] read request → {len(data)} bytes")
        gc.collect()

    def _build_json(self):
        dev_mode = False
        try:
            os.stat("devmode")
            dev_mode = True
        except OSError:
            pass

        payload = {
            "wpm":                  self.config.WPM,
            "delay_comma":          self.config.DELAY_COMMA,
            "delay_period":         self.config.DELAY_PERIOD,
            "accel_start":          self.config.ACCEL_START,
            "accel_rate":           self.config.ACCEL_RATE,
            "x_offset":             self.config.X_OFFSET,
            "word_offset":          self.config.WORD_OFFSET,
            "inverse":              self.config.INVERSE,
            "ble_on":               self.config.BLE_ON,
            "dev_mode":             dev_mode,
            "display_off_timeout":  self.config.AUTO_SHUTDOWN_TIMEOUT // 1000,
            "deep_sleep_timeout":   self.config.DEEP_SLEEP_TIMEOUT // 1000,
            "brightness":           self.config.BRIGHTNESS,
        }
        return json.dumps(payload).encode("utf-8")

    # ------------------------------------------------------------------
    # Write path
    # ------------------------------------------------------------------

    def on_write(self):
        """Called when central writes to the settings characteristic."""
        gc.collect()
        raw = self.ble.gatts_read(self.handle)
        print(f"[settings] write → {len(raw)} bytes")
        if self._apply_json(raw):
            self._persist()
            self.updated = True
        gc.collect()

    def _apply_json(self, raw_bytes):
        try:
            data = json.loads(raw_bytes.decode("utf-8"))
            print(f"[settings] parsed: {data}")

            self.config.WPM               = data.get("wpm",                  self.config.WPM)
            self.config.DELAY_COMMA       = data.get("delay_comma",          self.config.DELAY_COMMA)
            self.config.DELAY_PERIOD      = data.get("delay_period",         self.config.DELAY_PERIOD)
            self.config.ACCEL_START       = data.get("accel_start",          self.config.ACCEL_START)
            self.config.ACCEL_RATE        = data.get("accel_rate",           self.config.ACCEL_RATE)
            self.config.X_OFFSET          = data.get("x_offset",             self.config.X_OFFSET)
            self.config.WORD_OFFSET       = data.get("word_offset",          self.config.WORD_OFFSET)
            self.config.INVERSE           = data.get("inverse",              self.config.INVERSE)
            self.config.BLE_ON            = data.get("ble_on",               self.config.BLE_ON)
            self.config.AUTO_SHUTDOWN_TIMEOUT = data.get("display_off_timeout", self.config.AUTO_SHUTDOWN_TIMEOUT // 1000) * 1000
            self.config.DEEP_SLEEP_TIMEOUT    = data.get("deep_sleep_timeout",  self.config.DEEP_SLEEP_TIMEOUT // 1000) * 1000
            self.config.BRIGHTNESS        = data.get("brightness",           self.config.BRIGHTNESS)

            # dev_mode is a filesystem flag, not a config key
            self._set_devmode(data.get("dev_mode", False))
            return True
        except Exception as e:
            import sys
            print(f"[settings] parse error: {e}")
            sys.print_exception(e)
            return False

    def _set_devmode(self, enable):
        try:
            if enable:
                with open("devmode", "w") as f:
                    f.write("1")
                print("[settings] dev mode ON")
            else:
                try:
                    os.remove("devmode")
                except OSError:
                    pass
                print("[settings] dev mode OFF")
        except Exception as e:
            print(f"[settings] devmode toggle error: {e}")

    def _persist(self):
        """Write config_override.py so settings survive reboot."""
        gc.collect()
        content = (
            "# Auto-generated config override\n"
            f"WPM = {self.config.WPM}\n"
            f"DELAY_COMMA = {self.config.DELAY_COMMA}\n"
            f"DELAY_PERIOD = {self.config.DELAY_PERIOD}\n"
            f"ACCEL_START = {self.config.ACCEL_START}\n"
            f"ACCEL_RATE = {self.config.ACCEL_RATE}\n"
            f"X_OFFSET = {self.config.X_OFFSET}\n"
            f"WORD_OFFSET = {self.config.WORD_OFFSET}\n"
            f"INVERSE = {self.config.INVERSE}\n"
            f"BLE_ON = {self.config.BLE_ON}\n"
            f"AUTO_SHUTDOWN_TIMEOUT = {self.config.AUTO_SHUTDOWN_TIMEOUT}\n"
            f"DEEP_SLEEP_TIMEOUT = {self.config.DEEP_SLEEP_TIMEOUT}\n"
            f"BRIGHTNESS = {self.config.BRIGHTNESS}\n"
        )
        try:
            with open("config_override.py", "w") as f:
                f.write(content)
            print("[settings] config_override.py saved")
        except Exception as e:
            import sys
            print(f"[settings] persist error: {e}")
            sys.print_exception(e)

    # ------------------------------------------------------------------
    # Flag helpers (polled by server / main loop)
    # ------------------------------------------------------------------

    def check_updated(self):
        """Returns True once if settings changed since last call."""
        if self.updated:
            self.updated = False
            return True
        return False
