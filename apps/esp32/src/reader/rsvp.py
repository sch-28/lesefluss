"""Slim RSVP reader — owns word iteration, delay calculation, acceleration.

No event loop, no pause logic, no button handling.
The app state machine calls display_next_word() / get_word_delay() each tick.
"""

import gc
import config
from reader.storage import WordReader


# ── ScrubWindow ──────────────────────────────────────────────────────────

class ScrubWindow:
    """In-memory window of (byte_pos, word) pairs for scrub mode.

    Loads ~100 words centered on a byte position.  Scrubbing is pure index
    math — zero file I/O per step.  Extends automatically at edges.
    """

    HALF = 50  # words before / after center

    def __init__(self, filename, center_pos):
        self.filename = filename
        self._words = []   # list of (byte_pos, word_str)
        self._index = 0
        self._at_file_start = False
        self._at_file_end = False
        self._load_around(center_pos)

    # ── public API ───────────────────────────────────────────────────

    def step(self, n):
        """Move by n (±1).  Returns (byte_pos, word) or None at boundary."""
        new_idx = self._index + n
        if new_idx < 0:
            if not self._at_file_start:
                self._extend_backward()
                new_idx = self._index + n
            if new_idx < 0:
                return None
        elif new_idx >= len(self._words):
            if not self._at_file_end:
                self._extend_forward()
            if new_idx >= len(self._words):
                return None
        self._index = new_idx
        return self._words[self._index]

    def current(self):
        """(byte_pos, word) of the currently selected word."""
        if not self._words:
            return (0, "")
        return self._words[self._index]

    def current_byte_pos(self):
        """Byte offset of the currently selected word."""
        return self.current()[0]

    # ── loading ──────────────────────────────────────────────────────

    def _load_around(self, center_pos):
        """Load ~HALF words before and ~HALF words after center_pos."""
        print("ScrubWindow._load_around: center_pos=%d free=%d" % (center_pos, gc.mem_free()))
        before = self._scan_backward(center_pos, self.HALF)
        self._at_file_start = (len(before) < self.HALF) or (before and before[0][0] == 0) or center_pos == 0

        after = self._scan_forward(center_pos, self.HALF)
        self._at_file_end = len(after) < self.HALF

        if before and after and before[-1][0] == after[0][0]:
            self._words = before + after[1:]
            self._index = len(before) - 1
        else:
            self._words = before + after
            self._index = len(before)

        if self._index >= len(self._words):
            self._index = max(0, len(self._words) - 1)
        print("ScrubWindow._load_around: done words=%d index=%d free=%d" % (len(self._words), self._index, gc.mem_free()))

    def _extend_forward(self):
        """Append more words past the end of the window."""
        if not self._words or self._at_file_end:
            return
        print("ScrubWindow._extend_forward: cur_words=%d free=%d" % (len(self._words), gc.mem_free()))
        last_pos, last_word = self._words[-1]
        start = last_pos + len(last_word.encode('utf-8'))
        new = self._scan_forward(start, self.HALF)
        if len(new) < self.HALF:
            self._at_file_end = True
        self._words.extend(new)
        print("ScrubWindow._extend_forward: done total_words=%d free=%d" % (len(self._words), gc.mem_free()))

    def _extend_backward(self):
        """Prepend more words before the start of the window."""
        if not self._words or self._at_file_start:
            return
        print("ScrubWindow._extend_backward: cur_words=%d free=%d" % (len(self._words), gc.mem_free()))
        first_pos = self._words[0][0]
        new = self._scan_backward(first_pos, self.HALF)
        if not new:
            self._at_file_start = True
            return
        if new[0][0] == 0:
            self._at_file_start = True
        if len(new) < self.HALF:
            self._at_file_start = True
        self._words = new + self._words
        self._index += len(new)
        print("ScrubWindow._extend_backward: done total_words=%d index=%d free=%d" % (len(self._words), self._index, gc.mem_free()))

    # ── file scanning ────────────────────────────────────────────────

    @staticmethod
    def _trim_utf8(raw):
        """Trim incomplete UTF-8 from both ends of a byte buffer.

        Returns (trimmed_bytes, n_trimmed_front, n_trimmed_back).
        The caller can adjust file positions accordingly.
        """
        front = 0
        back = 0

        # Trim leading continuation bytes (0x80-0xBF) that belong to a
        # character whose leading byte is in the previous chunk.
        while front < len(raw) and 0x80 <= raw[front] <= 0xBF:
            front += 1

        # Trim incomplete trailing sequence.  Walk back from the end to
        # find a leading byte (>= 0xC0) and check if it's complete.
        if raw:
            for i in range(1, min(4, len(raw) - front + 1)):
                b = raw[-i]
                if b >= 0xC0:
                    # Leading byte found — how many bytes does it expect?
                    if b < 0xE0:
                        expected = 2
                    elif b < 0xF0:
                        expected = 3
                    else:
                        expected = 4
                    if i < expected:
                        back = i  # incomplete — trim these bytes
                    break
                elif b < 0x80:
                    break  # ASCII — no incomplete sequence

        trimmed = raw[front:len(raw) - back] if back else raw[front:]
        return trimmed, front, back

    @staticmethod
    def _parse_words(text, base_pos):
        """Extract (byte_pos, word) pairs from a decoded text chunk.

        base_pos is the file byte offset where the chunk started.
        Byte positions are computed per-word using UTF-8 encoded length
        so they stay accurate for multi-byte characters.
        """
        words = []
        byte_off = 0
        in_word = False
        word_start_byte = 0
        word_chars = []
        try:
            for c in text:
                is_ws = c in ' \t\n\r'
                if is_ws:
                    if in_word and word_chars:
                        w = ''.join(word_chars)
                        words.append((base_pos + word_start_byte, w))
                        word_chars = []
                    in_word = False
                else:
                    if not in_word:
                        word_start_byte = byte_off
                        in_word = True
                    word_chars.append(c)
                byte_off += len(c.encode('utf-8'))
        except Exception as e:
            print("_parse_words error at byte_off=%d nwords=%d free=%d: %s" % (byte_off, len(words), gc.mem_free(), e))
        # Flush trailing word.
        if in_word and word_chars:
            w = ''.join(word_chars)
            words.append((base_pos + word_start_byte, w))
        return words

    def _scan_forward(self, start_pos, count):
        """Read words forward from start_pos.  Returns [(byte_pos, word), ...]."""
        gc.collect()
        free = gc.mem_free()
        print("_scan_forward: start_pos=%d count=%d free=%d" % (start_pos, count, free))
        result = []
        try:
            with open(self.filename, 'rb') as f:
                f.seek(start_pos)
                file_pos = start_pos
                skip_first_partial = start_pos > 0
                reads = 0
                while len(result) < count:
                    try:
                        chunk = f.read(512)
                    except Exception as re:
                        print("_scan_forward: f.read failed at file_pos=%d reads=%d free=%d: %s" % (file_pos, reads, gc.mem_free(), re))
                        break
                    if not chunk:
                        break
                    reads += 1
                    clean, front, back = self._trim_utf8(chunk)
                    text = clean.decode('utf-8', 'ignore')
                    words = self._parse_words(text, file_pos + front)
                    if skip_first_partial and words:
                        # If we started mid-file, the first "word" may be a
                        # partial tail of a word that straddles start_pos.
                        first_byte = clean[0:1]
                        if first_byte and first_byte not in (b' ', b'\t', b'\n', b'\r'):
                            words = words[1:]
                        skip_first_partial = False
                    result.extend(words)
                    # Re-read trimmed trailing bytes on the next iteration.
                    file_pos += len(chunk) - back
                    if back:
                        f.seek(file_pos)
                print("_scan_forward: done reads=%d words=%d free=%d" % (reads, len(result), gc.mem_free()))
        except Exception as e:
            print("_scan_forward error: %s: %s (start_pos=%d free=%d)" % (type(e).__name__, e, start_pos, gc.mem_free()))
        return result[:count]

    def _scan_backward(self, end_pos, count):
        """Read words backward ending before end_pos.  Returns list in forward order."""
        if end_pos <= 0:
            return []
        gc.collect()
        free = gc.mem_free()
        print("_scan_backward: end_pos=%d count=%d free=%d" % (end_pos, count, free))
        result = []
        pos = end_pos
        try:
            with open(self.filename, 'rb') as f:
                iters = 0
                while len(result) < count and pos > 0:
                    read_size = min(512, pos)
                    start = pos - read_size
                    f.seek(start)
                    try:
                        chunk = f.read(read_size)
                    except Exception as re:
                        print("_scan_backward: f.read failed at start=%d read_size=%d free=%d: %s" % (start, read_size, gc.mem_free(), re))
                        break
                    clean, front, back = self._trim_utf8(chunk)
                    text = clean.decode('utf-8', 'ignore')
                    words = self._parse_words(text, start + front)
                    words = [w for w in words if w[0] < end_pos]
                    # If chunk starts mid-file AND we trimmed leading
                    # continuation bytes, the first word is already handled
                    # correctly (its partial prefix was trimmed).  But if we
                    # didn't trim yet landed mid-word, drop the first word.
                    if start > 0 and not front and words:
                        first_byte = chunk[0:1]
                        if first_byte and first_byte not in (b' ', b'\t', b'\n', b'\r'):
                            words = words[1:]
                    result = words + result
                    pos = start
                    iters += 1
                print("_scan_backward: done iters=%d words=%d free=%d" % (iters, len(result), gc.mem_free()))
        except Exception as e:
            print("_scan_backward error: %s: %s (end_pos=%d free=%d)" % (type(e).__name__, e, end_pos, gc.mem_free()))
        if len(result) > count:
            result = result[-count:]
        return result


# ── RSVPReader ───────────────────────────────────────────────────────────

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
        self._display_pos = 0   # byte position of the word currently on screen
        self._base_delay = 60.0 / config.WPM

        self._scrub_window = None   # ScrubWindow when in scrub mode

    # -- Loading -----------------------------------------------------------

    def load_text(self, text=None, resume=True):
        """Open the book (or sample text) for reading."""
        self._prev_x = 0
        self._prev_w = 0
        self._acceleration = 0.0
        self._word_count = 0
        self._display_pos = 0

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
            else:
                self._display_pos = start_pos

    # -- Word-by-word API (reading mode) -----------------------------------

    def display_next_word(self):
        """Draw the next word.  Returns the word str, or None at end-of-text."""
        if self.word_reader:
            self._display_pos = self.word_reader.get_position()

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

    # -- Scrub mode API ----------------------------------------------------

    def enter_scrub(self):
        """Create the scrub window around the current display position."""
        if self._words is not None:
            # Sample text mode — no ScrubWindow needed, step_word uses the list.
            return
        # Close the streaming reader to free its file handle and buffer memory
        # before allocating the scrub window.
        if self.word_reader:
            self.word_reader.close()
            self.word_reader = None
        gc.collect()
        self._scrub_window = ScrubWindow(self.storage.filename, self._display_pos)

    def exit_scrub_to_reading(self):
        """Transition scrub -> reading.  Reopen WordReader at the exact scrub position."""
        if self._scrub_window:
            pos = self._scrub_window.current_byte_pos()
            self._display_pos = pos
            self._scrub_window = None
            gc.collect()
            if self.word_reader:
                self.word_reader.close()
            self.word_reader = WordReader(self.storage.filename)
            self.word_reader.open(byte_position=pos, skip_boundary=False)
        elif self._words is not None:
            # Sample text — word_reader not used, _word_index already correct.
            pass

    def exit_scrub_to_idle(self):
        """Transition scrub -> idle.  Save position, clean up window."""
        if self._scrub_window:
            self._display_pos = self._scrub_window.current_byte_pos()
            self._scrub_window = None

    def show_current_word(self):
        """Display the word at the current position without advancing."""
        if self._words is not None:
            if 0 <= self._word_index < len(self._words):
                w = self._words[self._word_index]
            else:
                return None
        elif self._scrub_window:
            _, w = self._scrub_window.current()
        else:
            return None
        self.display.clear_word(self._prev_x, self._prev_w)
        self._prev_x, self._prev_w = self.display.show_word(w)
        return w

    def step_word(self, n):
        """Step 1 word forward (n>0) or backward (n<0) in scrub mode.

        Returns the displayed word, or None at file boundaries.
        """
        if n == 0:
            return None
        n = 1 if n > 0 else -1

        w = None

        if self._words is not None:
            # Sample text mode — simple index math.
            new_idx = self._word_index + n
            if new_idx < 0 or new_idx >= len(self._words):
                return None
            self._word_index = new_idx
            w = self._words[self._word_index]
        elif self._scrub_window:
            result = self._scrub_window.step(n)
            if result is None:
                return None
            _, w = result
        else:
            return None

        if w:
            self.display.clear_word(self._prev_x, self._prev_w)
            self._prev_x, self._prev_w = self.display.show_word(w)
        return w

    # -- Position ----------------------------------------------------------

    def save_position(self):
        if self.storage:
            if self._scrub_window:
                self.storage.save_position(self._scrub_window.current_byte_pos())
            elif self.word_reader:
                self.storage.save_position(self._display_pos)

    # -- Cleanup -----------------------------------------------------------

    def cleanup(self):
        if self.word_reader:
            self.word_reader.close()
            self.word_reader = None
        self._scrub_window = None

    # -- Internal (reading mode only) --------------------------------------

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
