import sys
import os

sys.path.append('/src')
sys.path.append('src')

import gc
import config

# ── Config overrides ──────────────────────────────────────────────────

_OVERRIDE_KEYS = (
    'WPM', 'DELAY_COMMA', 'DELAY_PERIOD', 'ACCEL_START',
    'ACCEL_RATE', 'X_OFFSET', 'WORD_OFFSET', 'INVERSE', 'BLE_ON',
    'AUTO_SHUTDOWN_TIMEOUT', 'DEEP_SLEEP_TIMEOUT',
)

def _load_overrides():
    try:
        import config_override
        for k in _OVERRIDE_KEYS:
            if hasattr(config_override, k):
                setattr(config, k, getattr(config_override, k))
        print(f"Config: WPM={config.WPM} BLE={config.BLE_ON}")
    except ImportError:
        print("No config override, using defaults")


# ── Main ──────────────────────────────────────────────────────────────

def main(force_run=False):
    if not force_run:
        try:
            os.stat('devmode')
            print("Dev mode — skipping main")
            return
        except:
            pass

    _load_overrides()

    # Hardware
    from hw.display import DisplayManager
    from hw.button import ButtonHandler
    from reader.storage import TextStorage

    display = DisplayManager()
    button  = ButtonHandler()
    storage = TextStorage()

    # BLE
    ble = None
    if config.BLE_ON:
        try:
            gc.collect()
            from ble import BLEServer
            ble = BLEServer(config)
            print("BLE started")
        except Exception as e:
            print(f"BLE failed: {e}")
            config.BLE_ON = False

    # Run
    from app import App
    App(display, button, storage, ble).run()


if __name__ == "__main__":
    main()
