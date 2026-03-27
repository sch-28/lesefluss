"""
BLE Server for RSVP Reader ESP32

Provides BLE GATT service for mobile app to:
- Read current settings from device
- Write new settings to device
- Settings stored as JSON in single characteristic

UUIDs are sourced from ble_config.py (auto-generated from packages/ble-config/config.json).
Run `pnpm setup:project` from the monorepo root to regenerate after UUID changes.
"""

import os
import bluetooth
import json
import gc
from micropython import const
from .ble_config import SERVICE_UUID, SETTINGS_CHAR_UUID, DEVICE_NAME

# BLE Event Constants
_IRQ_CENTRAL_CONNECT = const(1)
_IRQ_CENTRAL_DISCONNECT = const(2)
_IRQ_GATTS_WRITE = const(3)
_IRQ_GATTS_READ_REQUEST = const(4)
_BMS_MTU = const(512)


# UUIDs (sourced from ble_config.py — do not hardcode here)
_SERVICE_UUID = bluetooth.UUID(SERVICE_UUID)
_SETTINGS_CHAR_UUID = bluetooth.UUID(SETTINGS_CHAR_UUID)

# Characteristic flags
_FLAG_READ = const(0x0002)
_FLAG_WRITE = const(0x0008)
_FLAG_WRITE_NO_RESPONSE = const(0x0004)

class BLEServer:
    """BLE GATT Server for RSVP Reader settings sync"""
    
    def __init__(self, config_module, name=DEVICE_NAME):
        """
        Initialize BLE server
        
        Args:
            config_module: Reference to config module (for reading/writing settings)
            name: Device name for advertising
        """
        self.config = config_module
        self.name = name
        self.ble = bluetooth.BLE()
        self.ble.active(True)
        self.ble.irq(self._irq_handler)

        self.ble.config(mtu=_BMS_MTU)
        
        self.connected = False
        self.conn_handle = None
        self.settings_updated = False  # Flag to signal settings change
        
        # Register GATT service
        self._register_service()
        
        # Start advertising
        self.start_advertising()
        
        print(f"BLE Server initialized: {name}")
    
    def _register_service(self):
        """Register GATT service with settings characteristic"""
        
        # Define service with one characteristic (read/write settings JSON)
        services = (
            (
                _SERVICE_UUID,
                (
                    (_SETTINGS_CHAR_UUID, _FLAG_READ | _FLAG_WRITE),
                ),
            ),
        )
        
        ((self.settings_handle,),) = self.ble.gatts_register_services(services)
        self.ble.gatts_write(self.settings_handle, bytes(512))

        print(f"GATT service registered, settings handle: {self.settings_handle}")
    
    def _get_settings_json(self):
        """Get current settings as JSON bytes"""
        gc.collect()

        dev_mode = False
        try:
            os.stat('devmode')
            dev_mode = True
        except:
            pass
        
        settings = {
            "wpm": self.config.WPM,
            "delay_comma": self.config.DELAY_COMMA,
            "delay_period": self.config.DELAY_PERIOD,
            "accel_start": self.config.ACCEL_START,
            "accel_rate": self.config.ACCEL_RATE,
            "x_offset": self.config.X_OFFSET,
            "word_offset": self.config.WORD_OFFSET,
            "inverse": self.config.INVERSE,
            "ble_on": self.config.BLE_ON,
            "dev_mode": dev_mode,
        }
        
        json_str = json.dumps(settings)
        return json_str.encode('utf-8')
    
    def _save_settings_from_json(self, json_bytes):
        """
        Parse JSON and save settings to config_override.py
        
        Args:
            json_bytes: JSON string as bytes
        
        Returns:
            True if successful, False otherwise
        """
        gc.collect()
        
        try:
            # Parse JSON
            json_str = json_bytes.decode('utf-8')
            print(f"Received {len(json_bytes)} bytes: {json_str}")
            settings = json.loads(json_str)
            
            print(f"Received settings: {settings}")
            
            # Update config module
            self.config.WPM = settings.get("wpm", self.config.WPM)
            self.config.DELAY_COMMA = settings.get("delay_comma", self.config.DELAY_COMMA)
            self.config.DELAY_PERIOD = settings.get("delay_period", self.config.DELAY_PERIOD)
            self.config.ACCEL_START = settings.get("accel_start", self.config.ACCEL_START)
            self.config.ACCEL_RATE = settings.get("accel_rate", self.config.ACCEL_RATE)
            self.config.X_OFFSET = settings.get("x_offset", self.config.X_OFFSET)
            self.config.WORD_OFFSET = settings.get("word_offset", self.config.WORD_OFFSET)
            self.config.INVERSE = settings.get("inverse", self.config.INVERSE)
            self.config.BLE_ON = settings.get("ble_on", self.config.BLE_ON)

            devMode = settings.get("dev_mode", False)
            try:
                if devMode:
                    with open('devmode', 'w') as f:
                        f.write('1')
                    print("Dev mode ON")
                else:
                    try:
                        os.stat('devmode')
                        os.remove('devmode')
                    except:
                        pass
                    print("Dev mode OFF")
            except Exception as e:
                print(f"Error toggling dev mode: {e}")
                

            # Save to config_override.py
            self._save_config_override()
            
            # Set flag to signal settings were updated
            self.settings_updated = True
            
            print("Settings saved successfully")
            return True
            
        except Exception as e:
            print(f"Error saving settings: {e}")
            import sys
            sys.print_exception(e)
            return False
    
    def _save_config_override(self):
        """Save current config to config_override.py"""
        gc.collect()
        
        config_content = f"""# Auto-generated config override
WPM = {self.config.WPM}
DELAY_COMMA = {self.config.DELAY_COMMA}
DELAY_PERIOD = {self.config.DELAY_PERIOD}
ACCEL_START = {self.config.ACCEL_START}
ACCEL_RATE = {self.config.ACCEL_RATE}
X_OFFSET = {self.config.X_OFFSET}
WORD_OFFSET = {self.config.WORD_OFFSET}
INVERSE = {self.config.INVERSE}
BLE_ON = {self.config.BLE_ON}
"""
        
        try:
            with open('config_override.py', 'w') as f:
                f.write(config_content)
            print("Config override saved")
        except Exception as e:
            print(f"Error saving config override: {e}")
            import sys
            sys.print_exception(e)
    
    def _irq_handler(self, event, data):
        """Handle BLE events"""
        
        if event == _IRQ_CENTRAL_CONNECT:
            # Central (phone app) connected
            conn_handle, _, _ = data
            self.connected = True
            self.conn_handle = conn_handle
            print(f"BLE connected: handle {conn_handle}")
            
        elif event == _IRQ_CENTRAL_DISCONNECT:
            # Central disconnected
            conn_handle, _, _ = data
            self.connected = False
            self.conn_handle = None
            print(f"BLE disconnected: handle {conn_handle}")
            
            # Restart advertising
            self.start_advertising()
            
        elif event == _IRQ_GATTS_WRITE:
            # Central wrote to characteristic
            conn_handle, attr_handle = data
            
            if attr_handle == self.settings_handle:
                # Settings characteristic written
                gc.collect()
                
                # Read the written value
                value = self.ble.gatts_read(self.settings_handle)
                print(f"Settings write: {len(value)} bytes")
                
                # Parse and save settings
                self._save_settings_from_json(value)
                
                gc.collect()
        
        elif event == _IRQ_GATTS_READ_REQUEST:
            # Central wants to read characteristic
            conn_handle, attr_handle = data
            
            if attr_handle == self.settings_handle:
                # Update settings characteristic with current values
                gc.collect()
                value = self._get_settings_json()
                self.ble.gatts_write(self.settings_handle, value)
                print(f"Settings read request: {len(value)} bytes")
                gc.collect()
    
    def start_advertising(self):
        """Start BLE advertising (reactivate BLE if needed)"""
        
        # Check if BLE was deactivated (e.g., after WiFi mode)
        if not self.ble.active():
            print("BLE was deactivated, reactivating...")
            self.ble.active(True)
            # Re-register service after reactivation
            self._register_service()
        
        # Advertising payload
        # Format: [length, type, data, ...]
        # Type 0x01: Flags (LE General Discoverable, BR/EDR not supported)
        # Type 0x09: Complete local name
        
        name_bytes = self.name.encode('utf-8')
        
        payload = bytes([
            0x02, 0x01, 0x06,  # Flags: General discoverable, no BR/EDR
            len(name_bytes) + 1, 0x09,  # Complete local name
        ]) + name_bytes
        
        # Start advertising with 100ms interval
        self.ble.gap_advertise(100000, adv_data=payload)
        print(f"BLE advertising started: {self.name}")
    
    def stop_advertising(self):
        """Stop BLE advertising"""
        self.ble.gap_advertise(None)
        print("BLE advertising stopped")
    
    def is_connected(self):
        """Check if a central device is connected"""
        return self.connected
    
    def check_settings_updated(self):
        """
        Check if settings were updated and clear the flag
        
        Returns:
            True if settings were updated since last check, False otherwise
        """
        if self.settings_updated:
            self.settings_updated = False
            return True
        return False
    
    def deinit(self):
        """Cleanup BLE resources"""
        gc.collect()
        
        if self.connected and self.conn_handle is not None:
            # Disconnect
            self.ble.gap_disconnect(self.conn_handle)
        
        self.stop_advertising()
        self.ble.active(False)
        print("BLE server deinitialized")
        
        gc.collect()
