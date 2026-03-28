import time
import sys
import os

# Add src to Python path for MicroPython
sys.path.append('/src')
sys.path.append('src')

import config
from display_manager import DisplayManager
from button_handler import ButtonHandler
from rsvp_reader import RSVPReader
from wifi import WiFiManager
from text_storage import TextStorage

# Import BLE server if enabled
ble_server = None
if config.BLE_ON:
    try:
        from ble import BLEServer
    except ImportError:
        print("BLE not available on this device")
        config.BLE_ON = False

# Settings that can be overridden via config_override.py or BLE
_OVERRIDE_KEYS = (
    'WPM', 'DELAY_COMMA', 'DELAY_PERIOD', 'ACCEL_START',
    'ACCEL_RATE', 'X_OFFSET', 'WORD_OFFSET', 'INVERSE', 'BLE_ON',
)

def _load_config_overrides():
    """Apply config_override.py values onto the config module."""
    try:
        import config_override
        for key in _OVERRIDE_KEYS:
            if hasattr(config_override, key):
                setattr(config, key, getattr(config_override, key))
        print(f"Config override loaded: WPM={config.WPM}, BLE={config.BLE_ON}")
    except ImportError:
        print("No config override found, using defaults")

def _run_wifi_mode(display, wifi, storage, reader):
    """Run WiFi AP mode, pausing BLE while active.
    Returns (storage, reader) — may be new instances if a book was uploaded."""
    display.show_centered_message("WiFi Mode")
    time.sleep(0.5)

    # Stop BLE while in WiFi mode (resource conflict)
    if ble_server and config.BLE_ON:
        print("Stopping BLE for WiFi mode")
        ble_server.stop_advertising()

    if wifi.start_ap():
        wifi.run(storage, config)

    # Restart BLE after WiFi mode
    if ble_server and config.BLE_ON:
        print("Restarting BLE advertising")
        ble_server.start_advertising()

    # Reload storage if a new book was uploaded
    if wifi.needs_reload:
        storage = TextStorage()
        reader = RSVPReader(display, reader.button, storage, ble_server)
        wifi.needs_reload = False

    display.show_centered_message("Loading...")
    time.sleep(0.5)
    return storage, reader

def main(force_run=False):
    """Main entry point for RSVP reader"""
    
    # Check for dev mode - if enabled, don't run main app (unless force_run)
    if not force_run:
        try:
            os.stat('devmode')
            print("Dev mode active - main.py not executing (use force_run=True to override)")
            return
        except:
            pass

    _load_config_overrides()
    
    # Initialize hardware
    display = DisplayManager()
    button = ButtonHandler()
    storage = TextStorage()
    wifi = WiFiManager(display)
    
    # Initialize BLE server if enabled
    global ble_server
    if config.BLE_ON and ble_server is None:
        try:
            import gc
            gc.collect()
            ble_server = BLEServer(config)
            print("BLE server started")
        except Exception as e:
            print(f"Failed to start BLE server: {e}")
            import sys
            sys.print_exception(e)
            config.BLE_ON = False
    
    reader = RSVPReader(display, button, storage, ble_server)
    
    # Main loop
    while True:
        # Check if BLE settings were updated while idle
        if ble_server and ble_server.check_settings_updated():
            print("Settings updated via BLE, restarting...")
            display.show_centered_message("Updating...")
            time.sleep(1)
            import machine
            machine.soft_reset()
        
        # Idle screen — wait for user
        display.show_centered_message("Press BOOT")
        press_type = button.wait_for_press_or_long_press(5000)
        
        if press_type == 'long':
            storage, reader = _run_wifi_mode(display, wifi, storage, reader)
            continue
            
        # Load text from storage or use sample
        if storage.has_text():
            reader.load_text(resume=True)
        else:
            reader.load_text(text=config.SAMPLE_TEXT, resume=False)
        
        # Start reading
        result = reader.run_reading_loop()
        
        if result == 'wifi':
            storage, reader = _run_wifi_mode(display, wifi, storage, reader)
        elif result == 'restart':
            display.show_centered_message("Updating...")
            time.sleep(1)
            import machine
            machine.soft_reset()

if __name__ == "__main__":
    main()
