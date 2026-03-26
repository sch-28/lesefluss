import machine
import time
import config

class ButtonHandler:
    """Handles button input with debouncing"""
    
    def __init__(self):
        self.button = machine.Pin(config.PIN_BOOT_BUTTON, machine.Pin.IN, machine.Pin.PULL_UP)
        self.last_state = 1
        self.press_start_time = 0
    
    def is_pressed(self):
        """Check if button is currently pressed (LOW = pressed)"""
        return self.button.value() == 0
    
    def wait_for_press(self):
        """Block until button is pressed"""
        while self.button.value() == 1:
            time.sleep(0.1)
        time.sleep(0.2)  # Debounce delay
    
    def check_press_state(self, long_press_ms=5000):
        """
        Check button state (non-blocking).
        Returns: 'long' if held for duration, 'short' if just released, None otherwise.
        """
        current_state = self.button.value()
        current_time = time.ticks_ms()
        
        # Button just pressed
        if current_state == 0 and self.last_state == 1:
            self.press_start_time = current_time
            self.last_state = current_state
            return None
        
        # Button being held
        if current_state == 0 and self.last_state == 0:
            held_time = time.ticks_diff(current_time, self.press_start_time)
            if held_time > long_press_ms:
                self.last_state = 1  # Reset to prevent multiple triggers
                return 'long'
            return None
        
        # Button released
        if current_state == 1 and self.last_state == 0:
            held_time = time.ticks_diff(current_time, self.press_start_time)
            self.last_state = current_state
            if held_time < long_press_ms:
                return 'short'
        
        return None
    
    def wait_for_press_or_long_press(self, long_press_ms=5000):
        """
        Wait for button press (blocking). Returns 'short' or 'long'.
        Uses check_press_state internally.
        """
        # Reset state
        self.last_state = 1
        
        # Wait for press to start
        while self.button.value() == 1:
            time.sleep(0.1)
        
        # Now wait for the result
        while True:
            result = self.check_press_state(long_press_ms)
            if result:
                time.sleep(0.2)  # Debounce
                return result
            time.sleep(0.05)
