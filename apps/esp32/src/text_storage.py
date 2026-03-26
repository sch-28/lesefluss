class TextStorage:
    """Handles saving and loading text from ESP32 flash storage"""
    
    def __init__(self, slot=1):
        """Initialize with a specific book slot (1-4)"""
        if slot < 1 or slot > 4:
            raise ValueError("Slot must be between 1 and 4")
        self.slot = slot
        self.filename = f"book-{slot}.txt"
        self.position_file = f"position-{slot}.txt"
    
    def save_text(self, text):
        """Save text to file"""
        try:
            with open(self.filename, 'w') as f:
                f.write(text)
            # Reset position when new text is loaded
            self.save_position(0)
            return True
        except Exception as e:
            print(f"Error saving text: {e}")
            return False
    
    def load_text(self):
        """Load text from file. Returns text or empty string if no file.
        WARNING: Only use for small files! For large files, use WordReader."""
        try:
            with open(self.filename, 'rb') as f:
                data = f.read()
                text = data.decode('utf-8', 'ignore')
                print(f"load_text: read {len(data)} bytes from {self.filename}")
                return text
        except Exception as e:
            print(f"load_text error: {e}")
            return ""
    
    def has_text(self):
        """Check if text file exists and has content"""
        try:
            import os
            size = os.stat(self.filename)[6]
            return size > 0
        except:
            return False
    
    def delete_text(self):
        """Delete text file"""
        try:
            import os
            os.remove(self.filename)
            return True
        except:
            return False
    
    def save_position(self, byte_pos):
        """Save current reading position with backup"""
        try:
            import gc
            gc.collect()  # Free memory before file write
            
            # Backup existing position file if it exists
            backup_file = f"{self.position_file}.bak"
            try:
                with open(self.position_file, 'r') as f:
                    old_pos = f.read()
                # Save backup
                with open(backup_file, 'w') as f:
                    f.write(old_pos)
                print(f"Backed up position: {old_pos}")
            except:
                pass  # No existing file, that's ok
            
            # Write new position
            with open(self.position_file, 'w') as f:
                f.write(str(byte_pos))
            
            # Verify it was written correctly
            with open(self.position_file, 'r') as f:
                saved = f.read().strip()
                if saved != str(byte_pos):
                    print(f"WARNING: Position mismatch! Wrote {byte_pos}, read {saved}")
                    # Try to restore from backup
                    try:
                        with open(backup_file, 'r') as bf:
                            backup_pos = bf.read()
                        print(f"Restoring from backup: {backup_pos}")
                        with open(self.position_file, 'w') as f:
                            f.write(backup_pos)
                    except:
                        pass
                    return False
                else:
                    print(f"Position saved: {byte_pos}")
            return True
        except Exception as e:
            import sys
            print(f"ERROR saving position: {type(e).__name__}: {e}")
            sys.print_exception(e)
            # Try to keep backup intact
            return False
    
    def load_position(self, word_offset=0):
        """Load saved reading position, optionally going back N words.
        Returns 0 if no saved position.
        
        Args:
            word_offset: Number of words to go back from saved position (0-20)
        """
        try:
            with open(self.position_file, 'r') as f:
                pos = int(f.read().strip())
                print(f"TextStorage.load_position: {pos} from {self.position_file}")
                
                # Apply word offset if requested
                if word_offset > 0 and pos > 0:
                    adjusted_pos = self._go_back_n_words(pos, word_offset)
                    print(f"Applied word_offset={word_offset}: {pos} -> {adjusted_pos}")
                    return adjusted_pos
                
                return pos
        except Exception as e:
            print(f"TextStorage.load_position error: {e}")
            return 0
    
    def _go_back_n_words(self, byte_pos, n_words):
        """Go back N words from byte position. Returns adjusted position."""
        try:
            if byte_pos == 0:
                return 0
            
            # Read a chunk backwards from position (up to 2KB should be enough)
            chunk_size = min(2048, byte_pos)
            start_pos = byte_pos - chunk_size
            
            with open(self.filename, 'rb') as f:
                f.seek(start_pos)
                chunk = f.read(chunk_size).decode('utf-8', 'ignore')
            
            # Split into words and find position N words back
            words = []
            word = ""
            positions = []  # Track byte positions for each word
            
            for i, c in enumerate(chunk):
                if c in ' \t\n\r':
                    if word:
                        words.append(word)
                        positions.append(start_pos + i - len(word.encode('utf-8')))
                        word = ""
                else:
                    word += c
            
            # Add final word if any
            if word:
                words.append(word)
                positions.append(start_pos + len(chunk) - len(word.encode('utf-8')))
            
            # Find how many words back to go
            if len(words) <= n_words:
                # Not enough words in chunk, go to start
                return max(0, start_pos)
            else:
                # Go back N words from the end
                target_idx = len(words) - n_words - 1
                return positions[target_idx] if target_idx >= 0 else 0
                
        except Exception as e:
            print(f"_go_back_n_words error: {e}")
            # On error, just return original position
            return byte_pos
    
    def clear_position(self):
        """Clear saved position"""
        try:
            import os
            os.remove(self.position_file)
            return True
        except:
            return False
    
    def get_file_size(self):
        """Get file size in bytes"""
        try:
            import os
            return os.stat(self.filename)[6]
        except:
            return 0
    
    def get_word_count(self):
        """Estimate word count from file size (avoids loading full file)"""
        # Rough estimate: ~6 bytes per word on average
        return self.get_file_size() // 6


class WordReader:
    """Streaming word reader for large files - reads one word at a time"""
    
    def __init__(self, filename):
        self.filename = filename
        self.file = None
        self.buffer = ""
        self.chunk_size = 512  # Read 512 bytes at a time
        self.eof = False
    
    def open(self, byte_position=0):
        """Open the file for reading, optionally seeking to byte position"""
        try:
            self.file = open(self.filename, 'rb')
            self.buffer = ""
            self.eof = False
            
            if byte_position > 0:
                print(f"Seeking to byte {byte_position}")
                self.file.seek(byte_position)
                # Skip partial word at seek position
                self._skip_to_word_boundary()
            
            return True
        except Exception as e:
            import sys
            print(f"WordReader open error: {type(e).__name__}: {e}")
            sys.print_exception(e)
            return False
    
    def _skip_to_word_boundary(self):
        """After seeking, skip to the next word boundary"""
        # Read until we hit whitespace (end of partial word we landed in)
        while True:
            chunk = self.file.read(64)
            if not chunk:
                self.eof = True
                return
            text = chunk.decode('utf-8', 'ignore')
            for i, c in enumerate(text):
                if c in ' \t\n\r':
                    # Found boundary, put rest in buffer
                    self.buffer = text[i:].lstrip()
                    return
            # No whitespace yet, keep reading
    
    def close(self):
        """Close the file"""
        if self.file:
            self.file.close()
            self.file = None
    
    def get_position(self):
        """Get current byte position in file (for saving)"""
        if self.file:
            # Current file position minus unread buffer
            return self.file.tell() - len(self.buffer.encode('utf-8'))
        return 0
    
    def next_word(self):
        """Get the next word from the file. Returns None at EOF."""
        if not self.file:
            return None
        
        while True:
            # Try to extract a word from buffer
            self.buffer = self.buffer.lstrip()
            if self.buffer:
                # Find end of word
                space_idx = -1
                for i, c in enumerate(self.buffer):
                    if c in ' \t\n\r':
                        space_idx = i
                        break
                
                if space_idx > 0:
                    word = self.buffer[:space_idx]
                    self.buffer = self.buffer[space_idx:]
                    return word
                elif self.eof:
                    # Last word in file
                    word = self.buffer
                    self.buffer = ""
                    return word if word else None
                elif len(self.buffer) > 1000:
                    # Buffer too large without finding space - likely corrupt data
                    # Return what we have and reset
                    word = self.buffer[:50]  # Take first 50 chars as a "word"
                    self.buffer = self.buffer[50:]
                    return word
            elif self.eof:
                return None
            
            # Need more data
            try:
                chunk = self.file.read(self.chunk_size)
                if not chunk:
                    self.eof = True
                    continue
                self.buffer += chunk.decode('utf-8', 'ignore')
            except OSError as e:
                print(f"WordReader OSError: {e}")
                # Try to recover by reopening
                self.eof = True
                return None
            except MemoryError:
                print("WordReader MemoryError - buffer too large")
                # Clear buffer and try to continue
                self.buffer = ""
                self.eof = True
                return None
            except Exception as e:
                import sys
                print(f"WordReader read error: {type(e).__name__}: {e}")
                sys.print_exception(e)
                self.eof = True
                return None
