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

def main(force_run=False):
    """Main entry point for RSVP reader"""
    
    # Check for dev mode - if enabled, don't run main app (unless force_run)
    if not force_run:
        try:
            os.stat('devmode')
            print("Dev mode active - main.py not executing (use force_run=True to override)")
            return  # Exit main() without running the app
        except:
            pass  # Dev mode not active, continue normally
    
    # Load config overrides if they exist
    try:
        import config_override
        if hasattr(config_override, 'WPM'):
            config.WPM = config_override.WPM
        if hasattr(config_override, 'CURRENT_SLOT'):
            config.CURRENT_SLOT = config_override.CURRENT_SLOT
        if hasattr(config_override, 'DELAY_COMMA'):
            config.DELAY_COMMA = config_override.DELAY_COMMA
        if hasattr(config_override, 'DELAY_PERIOD'):
            config.DELAY_PERIOD = config_override.DELAY_PERIOD
        if hasattr(config_override, 'ACCEL_START'):
            config.ACCEL_START = config_override.ACCEL_START
        if hasattr(config_override, 'ACCEL_RATE'):
            config.ACCEL_RATE = config_override.ACCEL_RATE
        if hasattr(config_override, 'X_OFFSET'):
            config.X_OFFSET = config_override.X_OFFSET
        if hasattr(config_override, 'WORD_OFFSET'):
            config.WORD_OFFSET = config_override.WORD_OFFSET
        if hasattr(config_override, 'INVERSE'):
            config.INVERSE = config_override.INVERSE
        if hasattr(config_override, 'BLE_ON'):
            config.BLE_ON = config_override.BLE_ON
        print(f"Config override loaded: WPM={config.WPM}, SLOT={config.CURRENT_SLOT}, BLE={config.BLE_ON}")
    except ImportError:
        print("No config override found, using defaults")
    
    # Initialize hardware
    display = DisplayManager()
    button = ButtonHandler()
    storage = TextStorage(config.CURRENT_SLOT)
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
    
    # Initialize reader with BLE server reference
    reader = RSVPReader(display, button, storage, ble_server)
    
    # Main loop
    while True:
        # Check if BLE settings were updated
        if ble_server and ble_server.check_settings_updated():
            print("Settings updated via BLE, restarting...")
            display.show_centered_message("Updating...")
            time.sleep(1)
            import machine
            machine.soft_reset()
        
        # Show idle screen
        display.show_centered_message("Press BOOT")
        
        # Wait for button press (short or long)
        press_type = button.wait_for_press_or_long_press(5000)
        
        if press_type == 'long':
            # Enter WiFi mode from idle
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
            
            # Check if storage needs reload (slot changed)
            if wifi.needs_reload:
                storage = TextStorage(config.CURRENT_SLOT)
                reader = RSVPReader(display, button, storage, ble_server)
                wifi.needs_reload = False
            
            # WiFi mode exited, reload text
            display.show_centered_message("Loading...")
            time.sleep(0.5)
            continue
            
        # Load text from storage or use sample
        if storage.has_text():
            # Use streaming reader for file
            reader.load_text(resume=True)
        else:
            # Use sample text (small enough to fit in memory)
            reader.load_text(text=config.SAMPLE_TEXT, resume=False)
        
        # Start reading
        result = reader.run_reading_loop()
        
        # Check if WiFi mode was triggered during reading
        if result == 'wifi':
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
            
            # Check if storage needs reload (slot changed)
            if wifi.needs_reload:
                storage = TextStorage(config.CURRENT_SLOT)
                reader = RSVPReader(display, button, storage, ble_server)
                wifi.needs_reload = False
            
            # WiFi mode exited, reload text
            display.show_centered_message("Loading...")
            time.sleep(0.5)
        
        # Check if restart was requested (settings updated via BLE)
        elif result == 'restart':
            display.show_centered_message("Updating...")
            time.sleep(1)
            import machine
            machine.soft_reset()

if __name__ == "__main__":
    main()
