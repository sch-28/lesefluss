import machine
import time
import config


class ButtonHandler:
    """Debounced single-button input (active-low with pull-up)."""

    def __init__(self, pin=None):
        if pin is None:
            pin = config.PIN_BOOT_BUTTON
        self.button = machine.Pin(pin, machine.Pin.IN, machine.Pin.PULL_UP)
        self.last_state = 1
        self.press_start_time = 0

    def is_pressed(self):
        return self.button.value() == 0

    def wait_for_press(self):
        """Block until button is pressed and released."""
        while self.button.value() == 1:
            time.sleep(0.1)
        time.sleep(0.2)

    def sleep_interruptible(self, seconds):
        """Sleep for up to *seconds*, but return early if the button is
        pressed.  Returns True if interrupted by a press, False otherwise.

        Called from the reading loop so a tap during a word delay is never
        swallowed by a long sleep."""
        end = time.ticks_add(time.ticks_ms(), int(seconds * 1000))
        while time.ticks_diff(end, time.ticks_ms()) > 0:
            if self.button.value() == 0:
                # Record the press start so check_press_state sees it
                if self.last_state == 1:
                    self.press_start_time = time.ticks_ms()
                    self.last_state = 0
                return True
            time.sleep_ms(10)
        return False

    def check_press_state(self, long_press_ms=5000):
        """Non-blocking check.  Returns 'long', 'short', or None."""
        current_state = self.button.value()
        now = time.ticks_ms()

        if current_state == 0 and self.last_state == 1:
            self.press_start_time = now
            self.last_state = 0
            return None

        if current_state == 0 and self.last_state == 0:
            if time.ticks_diff(now, self.press_start_time) > long_press_ms:
                self.last_state = 1
                return 'long'
            return None

        if current_state == 1 and self.last_state == 0:
            held = time.ticks_diff(now, self.press_start_time)
            self.last_state = 1
            if held < long_press_ms:
                return 'short'

        return None
