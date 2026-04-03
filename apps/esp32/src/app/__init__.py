"""Single-loop state machine for the RSVP reader.

States:  idle | reading
BLE transfer progress is handled as an overlay on any state.
"""

import time
import config

from app.homescreen import (
    draw_homescreen,
    draw_transfer_progress,
    clear_transfer_state,
)
from reader.storage import TextStorage
from reader.rsvp import RSVPReader


def _book_title():
    # Prefer the human-readable title synced from the app (book.title).
    try:
        with open('book.title', 'r') as f:
            t = f.read().strip()
        if t:
            return t
    except:
        pass
    # Fall back to the book hash (8-char hex) with basic humanisation.
    try:
        with open('book.hash', 'r') as f:
            name = f.read().strip()
        if '.' in name:
            name = name.rsplit('.', 1)[0]
        return name.replace('_', ' ').replace('-', ' ')
    except:
        pass
    try:
        import os
        os.stat('book.txt')
        return 'Untitled'
    except:
        return None


def _progress_pct(storage):
    try:
        pos = storage.load_position()
        size = storage.get_file_size()
        if size > 0:
            return min(100, round(pos * 100 / size))
    except:
        pass
    return 0


class App:
    """Top-level controller.  Call ``App(...).run()`` and never return."""

    def __init__(self, display, button, storage, ble):
        self.display = display
        self.button = button
        self.storage = storage
        self.ble = ble
        self.reader = RSVPReader(display, storage, ble)

        self.state = 'idle'
        self._transferring = False
        self._last_activity = time.ticks_ms()
        self._display_off = False
        self._display_off_at = 0

    # ------------------------------------------------------------------
    # Public
    # ------------------------------------------------------------------

    def run(self):
        self._show_home()
        while True:
            if self._poll_ble():
                continue
            if self.state == 'idle':
                self._tick_idle()
            elif self.state == 'reading':
                self._tick_reading()

    # ------------------------------------------------------------------
    # Idle
    # ------------------------------------------------------------------

    def _tick_idle(self):
        now = time.ticks_ms()

        if self._display_off:
            # Display is already off — wait for button or deep sleep.
            if self.button.is_pressed():
                # Wake display, reset timers.
                self.display.wakeup()
                self._display_off = False
                self._last_activity = now
                # Wait for release so the press isn't registered as 'short'.
                while self.button.is_pressed():
                    time.sleep_ms(10)
                self._show_home()
                return
            if time.ticks_diff(now, self._last_activity) > config.DEEP_SLEEP_TIMEOUT:
                self._enter_deep_sleep()
            time.sleep_ms(50)
            return

        p = self.button.check_press_state(5000)
        if p == 'short':
            self._start_reading()
            return

        if time.ticks_diff(now, self._last_activity) > config.AUTO_SHUTDOWN_TIMEOUT:
            self.display.shutdown()
            self._display_off = True
            self._display_off_at = time.ticks_ms()

        time.sleep(0.05)

    # ------------------------------------------------------------------
    # Reading
    # ------------------------------------------------------------------

    def _tick_reading(self):
        p = self.button.check_press_state(5000)
        if p == 'short':
            self._pause()
            return

        word = self.reader.display_next_word()
        if word is None:
            self.display.show_centered_message("Done!", color=(0, 255, 0))
            self.storage.clear_position()
            time.sleep(2)
            self.state = 'idle'
            self._show_home()
            return
        delay = self.reader.get_word_delay(word)
        if self.button.sleep_interruptible(delay):
            # Button was pressed during the word delay.  Wait for it to be
            # released so that check_press_state() fires 'short' on the very
            # next tick instead of seeing the button still held and racing
            # through more words.
            while self.button.is_pressed():
                time.sleep_ms(10)
            return

    # ------------------------------------------------------------------
    # Transitions
    # ------------------------------------------------------------------

    def _start_reading(self):
        if self.storage.has_text():
            self.reader.load_text(resume=True)
        else:
            self.reader.load_text(text=config.SAMPLE_TEXT, resume=False)
        self.display.clear()
        self.state = 'reading'

    def _pause(self):
        self.reader.save_position()
        self.state = 'idle'
        self._display_off = False
        self._last_activity = time.ticks_ms()
        self._show_home()

    def _reload_storage(self):
        self.storage = TextStorage()
        self.reader = RSVPReader(self.display, self.storage, self.ble)

    def _enter_deep_sleep(self):
        import machine
        import esp32
        if self.ble:
            self.ble.deinit()
        self.display.shutdown()
        esp32.wake_on_ext0(
            machine.Pin(config.PIN_BOOT_BUTTON, machine.Pin.IN, machine.Pin.PULL_UP),
            esp32.WAKEUP_ALL_LOW,
        )
        machine.deepsleep()

    # ------------------------------------------------------------------
    # BLE polling
    # ------------------------------------------------------------------

    def _poll_ble(self):
        """Returns True if state changed (caller should restart loop)."""
        if not self.ble:
            return False

        self.ble.poll()

        if self.ble.check_settings_updated():
            self.display.show_centered_message("Updating...")
            time.sleep(1)
            import machine
            machine.soft_reset()

        if self.ble.check_position_updated():
            if self.state == 'idle' and not self._display_off:
                self._show_home()

        in_prog, done, total = self.ble.get_transfer_progress()
        if in_prog:
            pct = int(done * 100 / total) if total > 0 else 0
            draw_transfer_progress(self.display, pct, done, total)
            self._transferring = True
            return False

        if self._transferring:
            self._transferring = False
            clear_transfer_state()
            if self.ble.check_transfer_completed():
                self.reader.cleanup()
                self._reload_storage()
                self.state = 'idle'
                self.display.show_centered_message("Book loaded!")
                time.sleep(1)
                self._show_home()
                return True
            # Transfer failed — redraw
            if self.state == 'idle':
                self._show_home()
            else:
                self.display.clear()

        return False

    # ------------------------------------------------------------------
    # Homescreen
    # ------------------------------------------------------------------

    def _show_home(self):
        title = _book_title()
        pct = _progress_pct(self.storage)
        draw_homescreen(self.display, title, pct, config.WPM)
