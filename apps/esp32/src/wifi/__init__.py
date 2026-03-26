import network
import time
from .utils import set_display

class WiFiManager:
    """Manages WiFi AP mode and web server"""
    
    def __init__(self, display):
        self.display = display
        self.ap = None
        self.ssid = "RSVP-Reader"
        self.ip = "192.168.4.1"
        self.needs_reload = False
        set_display(display)
        
    def start_ap(self):
        """Start WiFi access point"""
        self.ap = network.WLAN(network.AP_IF)
        self.ap.active(True)
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
        """Stop WiFi access point"""
        if self.ap:
            self.ap.active(False)
            self.ap = None
    
    def run(self, storage, config_module):
        """Run the web server"""
        from .server import Server
        server = Server(self)
        return server.run(storage, config_module)
