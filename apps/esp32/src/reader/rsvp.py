"""Slim RSVP reader — owns word iteration, delay calculation, acceleration.

No event loop, no pause logic, no button handling.
The app state machine calls display_next_word() / get_word_delay() each tick.
"""

import gc
import config
from reader.storage import WordReader


class RSVPReader:

    def __init__(self, display, storage, ble_server=None):
        self.display = display
        self.storage = storage
        self.ble_server = ble_server

        self.word_reader = None
        self._words = None          # only set for sample text
        self._word_index = 0

        self._prev_x = 0
        self._prev_w = 0
        self._acceleration = 0.0
        self._word_count = 0
        self._base_delay = 60.0 / config.WPM

    # -- Loading -----------------------------------------------------------

    def load_text(self, text=None, resume=True):
        """Open the book (or sample text) for reading."""
        self._prev_x = 0
        self._prev_w = 0
        self._acceleration = 0.0
        self._word_count = 0

        start_pos = 0
        if resume and self.storage:
            start_pos = self.storage.load_position(
                word_offset=getattr(config, 'WORD_OFFSET', 0))

        if text:
            self.word_reader = None
            self._words = text.split()
            self._word_index = min(start_pos, len(self._words))
        else:
            self._words = None
            self.word_reader = WordReader(self.storage.filename)
            if not self.word_reader.open(byte_position=start_pos):
                self.word_reader = None
                self._words = []
                self._word_index = 0

    # -- Word-by-word API --------------------------------------------------

    def display_next_word(self):
        """Draw the next word.  Returns the word str, or None at end-of-text."""
        word = self._next_word()
        if word is None:
            return None

        self.display.clear_word(self._prev_x, self._prev_w)
        self._prev_x, self._prev_w = self.display.show_word(word)

        self._word_count += 1
        if self._word_count % 100 == 0:
            gc.collect()

        return word

    def get_word_delay(self, word):
        """Delay in seconds for *word*, including acceleration ramp."""
        base = self._base_delay

        if word:
            if word.endswith('...') or word.endswith('\u2014') or word.endswith('--'):
                base *= config.DELAY_PERIOD
            elif word[-1] in '.!?':
                base *= config.DELAY_PERIOD
            elif word[-1] in ',;:':
                base *= config.DELAY_COMMA

        multiplier = config.ACCEL_START - self._acceleration
        delay = base * multiplier
        self._acceleration = min(
            self._acceleration + config.ACCEL_RATE,
            config.ACCEL_START - 1.0)
        return delay

    def reset_acceleration(self):
        self._acceleration = 0.0

    # -- Position ----------------------------------------------------------

    def save_position(self):
        if self.storage and self.word_reader:
            self.storage.save_position(self.word_reader.get_position())

    def get_progress_pct(self):
        """Return 0–100 progress through the book."""
        if self.word_reader and self.storage:
            pos = self.word_reader.get_position()
            size = self.storage.get_file_size()
            if size > 0:
                return min(100, round(pos * 100 / size))
        return 0

    # -- Cleanup -----------------------------------------------------------

    def cleanup(self):
        if self.word_reader:
            self.word_reader.close()
            self.word_reader = None

    # -- Internal ----------------------------------------------------------

    def _next_word(self):
        if self._words is not None:
            if self._word_index < len(self._words):
                w = self._words[self._word_index]
                self._word_index += 1
                return w
            return None
        if self.word_reader:
            return self.word_reader.next_word()
        return None
