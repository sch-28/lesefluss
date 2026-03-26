import socket
import select
import gc
import time

class Server:
    """HTTP server for WiFi configuration"""
    
    def __init__(self, wifi_manager):
        self.wifi = wifi_manager
        self.socket = None
    
    def run(self, storage, config_module):
        """Run the web server loop"""
        from .handlers import handle_request
        
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.socket.bind(('', 80))
        self.socket.listen(1)
        self.socket.setblocking(False)
        
        poller = select.poll()
        poller.register(self.socket, select.POLLIN)
        
        print(f"Web server running on {self.wifi.ip}")
        
        try:
            while True:
                gc.collect()
                events = poller.poll(1000)
                
                for sock, event in events:
                    if sock == self.socket:
                        try:
                            client, addr = self.socket.accept()
                            print(f"Client connected: {addr}")
                            result = handle_request(client, storage, config_module, self.wifi)
                            if result == 'shutdown':
                                return True
                        except OSError:
                            pass
        except Exception as e:
            print(f"Server error: {e}")
        finally:
            self._cleanup()
        
        return True
    
    def _cleanup(self):
        """Clean up server resources"""
        if self.socket:
            try:
                self.socket.close()
            except:
                pass
            self.socket = None
        self.wifi.stop_ap()
