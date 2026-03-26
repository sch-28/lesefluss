import time
import gc
import config
from text_storage import WordReader

class RSVPReader:
    """Handles RSVP reading logic and state management"""
    
    def __init__(self, display, button, storage=None):
        self.display = display
        self.button = button
        self.storage = storage
        self.word_reader = None
        self.current_word = None
        self.word_index = 0
        self.paused = False
        self.prev_x = 0
        self.prev_width = 0
        self.last_activity_time = 0
        self.word_display_time = 60.0 / config.WPM
        self.finished = False
    
    def load_text(self, text=None, resume=True):
        """Load text for reading. If text is provided, use it (for sample text).
        Otherwise, open the storage file for streaming."""
        self.prev_x = 0
        self.prev_width = 0
        self.paused = False
        self.finished = False
        
        # Get resume position (byte position in file)
        start_pos = 0
        if resume and self.storage:
            word_offset = getattr(config, 'WORD_OFFSET', 0)
            start_pos = self.storage.load_position(word_offset=word_offset)
            print(f"Resume byte position: {start_pos} (word_offset={word_offset})")
        
        if text:
            # Small text provided directly - use simple word list
            self.word_reader = None
            self._words = text.split()
            # For sample text, start_pos is treated as word index
            self.word_index = min(start_pos, len(self._words))
        else:
            # Use streaming reader for file
            self._words = None
            self.word_reader = WordReader(self.storage.filename)
            if self.word_reader.open(byte_position=start_pos):
                self.word_index = 0  # We track position via byte offset now
                print(f"Opened file at byte {start_pos}")
            else:
                # File open failed
                self.word_reader = None
                self._words = []
                self.word_index = 0
    
    def _get_next_word(self):
        """Get the next word from either the word list or streaming reader"""
        if self._words is not None:
            # Using simple word list
            if self.word_index < len(self._words):
                word = self._words[self.word_index]
                return word
            return None
        elif self.word_reader:
            # Using streaming reader
            return self.word_reader.next_word()
        return None
    
    def reset(self):
        """Reset reader state (but don't reset word_index - keep saved position)"""
        self.prev_x = 0
        self.prev_width = 0
        self.paused = False
        self.last_activity_time = time.ticks_ms()
    
    def is_finished(self):
        """Check if all words have been displayed"""
        return self.finished
    
    def toggle_pause(self):
        """Toggle pause state and save position"""
        self.paused = not self.paused
        self.last_activity_time = time.ticks_ms()
        
        if self.paused:
            # Save byte position when pausing
            if self.storage and self.word_reader:
                byte_pos = self.word_reader.get_position()
                self.storage.save_position(byte_pos)
                book_size = self.storage.get_file_size()
                progress = int((byte_pos / book_size) * 100) if book_size > 0 else 0
                self.display.show_pause_indicator(f"{progress}%")
            else:
                self.display.show_pause_indicator("0%")
        else:
            self.display.hide_pause_indicator()
    
    def check_auto_shutdown(self):
        """Check if auto-shutdown timeout has been reached. Returns True if should shutdown."""
        current_time = time.ticks_ms()
        return time.ticks_diff(current_time, self.last_activity_time) > config.AUTO_SHUTDOWN_TIMEOUT
    
    def handle_wakeup(self):
        """Handle wakeup from auto-shutdown"""
        self.button.wait_for_press()
        self.display.wakeup()
        self.last_activity_time = time.ticks_ms()
        
        # Redraw current state
        if self.paused and self.current_word:
            self.display.clear()
            self.display.show_word_centered(self.current_word)
            byte_pos = self.word_reader.get_position()
            book_size = self.storage.get_file_size()
            progress = int((byte_pos / book_size) * 100) if book_size > 0 else 0
            self.display.show_pause_indicator(f"{progress}%")
    
    def display_next_word(self):
        """Display the next word in the sequence"""
        word = self._get_next_word()
        
        if word is None:
            self.finished = True
            return None
        
        # Clear previous word area
        if self.prev_width > 0:
            y = (self.display.height - config.FONT_HEIGHT) // 2
            self.display.clear_rect(self.prev_x, y, self.prev_width, config.FONT_HEIGHT)
        
        # Display current word
        self.current_word = word
        self.prev_x, self.prev_width = self.display.show_word_centered(word)
        
        self.word_index += 1
        self.last_activity_time = time.ticks_ms()
        
        return word
    
    def get_word_delay(self, word):
        """Calculate delay for a word based on punctuation"""
        base_delay = self.word_display_time
        
        if not word:
            return base_delay
        
        # Check for long pauses first (ellipsis, dashes)
        if word.endswith('...') or word.endswith('—') or word.endswith('--'):
            return base_delay * config.DELAY_PERIOD
        
        # Check for end-of-sentence punctuation
        if word.endswith(('.', '!', '?')):
            return base_delay * config.DELAY_PERIOD
        
        # Check for mid-sentence punctuation
        if word.endswith((',', ';', ':')):
            return base_delay * config.DELAY_COMMA
        
        return base_delay
    
    def cleanup(self):
        """Clean up resources"""
        if self.word_reader:
            self.word_reader.close()
            self.word_reader = None
    
    def run_reading_loop(self):
        """Main reading loop. Returns 'wifi' if long press detected, None otherwise."""
        self.display.clear()
        self.reset()

        acceleration = 0
        word_count = 0
        
        try:
            while not self.is_finished():
                # Check for button press (short or long)
                press_result = self.button.check_press_state(5000)
                
                if press_result == 'long':
                    # Long press detected - signal WiFi mode
                    return 'wifi'
                elif press_result == 'short':
                    # Short press - toggle pause
                    self.toggle_pause()
                
                # Handle paused state
                if self.paused:
                    if self.check_auto_shutdown():
                        self.display.shutdown()
                        self.handle_wakeup()
                    time.sleep(0.1)
                    acceleration = 0
                    continue
                
                # Display next word and get delay
                word = self.display_next_word()
                if word:
                    # Apply acceleration: starts at ACCEL_START, ramps down to 1.0
                    accel_multiplier = config.ACCEL_START - acceleration
                    delay = self.get_word_delay(word) * accel_multiplier
                    time.sleep(delay)
                    acceleration = min(acceleration + config.ACCEL_RATE, config.ACCEL_START - 1.0)
                    
                    # Periodic garbage collection to prevent memory issues
                    word_count += 1
                    if word_count % 100 == 0:
                        gc.collect()
            
            # Finished reading
            self.display.show_centered_message("Done!", color=(0, 255, 0))
            # Clear position when finished
            if self.storage:
                self.storage.clear_position()
            time.sleep(2)
            return None
            
        finally:
            self.cleanup()
