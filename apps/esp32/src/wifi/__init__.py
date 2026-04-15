import network
import time
from .utils import set_display

class WiFiManager:
    """Manages WiFi AP mode and web server"""
    
    def __init__(self, display):
        self.display = display
        self.ap = None
        self.ssid = "Lesefluss"
        self.ip = "192.168.4.1"
        self.needs_reload = False
        set_display(display)
        
    def start_ap(self):
        """Start WiFi access point"""
        # Fully disable BLE before starting WiFi (resource conflict)
        try:
            import bluetooth
            ble = bluetooth.BLE()
            if ble.active():
                print("Disabling BLE for WiFi mode")
                ble.active(False)
                time.sleep(0.5)  # Give BLE time to fully shutdown
        except:
            pass  # BLE not available or already off
        
        self.ap = network.WLAN(network.AP_IF)
        self.ap.active(True)
        
        # Configure AP with explicit IP settings
        self.ap.ifconfig((self.ip, '255.255.255.0', self.ip, '8.8.8.8'))
        self.ap.config(essid=self.ssid, password="")
        
        while not self.ap.active():
            time.sleep(0.1)
        
        self.display.show_centered_message("WiFi Mode")
        time.sleep(1)
        self.display.show_centered_message(f"SSID:{self.ssid}")
        time.sleep(2)
        self.display.show_centered_message(self.ip)
        
        return True
    
    def stop_ap(self):
        """Stop WiFi access point and re-enable BLE if needed"""
        if self.ap:
            self.ap.active(False)
            self.ap = None
        
        # Re-enable BLE after WiFi mode (will be reinitialized by main.py)
        time.sleep(0.5)  # Give WiFi time to fully shutdown
    
    def run(self, storage, config_module):
        """Run the web server"""
        from .server import Server
        server = Server(self)
        return server.run(storage, config_module)
