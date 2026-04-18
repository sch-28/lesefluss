class TextStorage:
    """Single-book storage model: book.txt + position.txt on flash."""

    def __init__(self):
        self.filename = "book.txt"
        self.position_file = "position.txt"

    def save_text(self, text):
        try:
            with open(self.filename, 'w') as f:
                f.write(text)
            self.save_position(0)
            return True
        except Exception as e:
            print(f"Error saving text: {e}")
            return False

    def load_text(self):
        """WARNING: Only use for small files!  For large files use WordReader."""
        try:
            with open(self.filename, 'rb') as f:
                data = f.read()
                return data.decode('utf-8', 'ignore')
        except Exception as e:
            print(f"load_text error: {e}")
            return ""

    def has_text(self):
        try:
            import os
            return os.stat(self.filename)[6] > 0
        except:
            return False

    def delete_text(self):
        try:
            import os
            os.remove(self.filename)
            return True
        except:
            return False

    def save_position(self, byte_pos):
        """Save reading position with backup for crash safety."""
        try:
            import gc
            gc.collect()

            backup = f"{self.position_file}.bak"
            try:
                with open(self.position_file, 'r') as f:
                    old = f.read()
                with open(backup, 'w') as f:
                    f.write(old)
            except:
                pass

            with open(self.position_file, 'w') as f:
                f.write(str(byte_pos))

            with open(self.position_file, 'r') as f:
                if f.read().strip() != str(byte_pos):
                    try:
                        with open(backup, 'r') as bf:
                            with open(self.position_file, 'w') as f2:
                                f2.write(bf.read())
                    except:
                        pass
                    return False
            return True
        except Exception as e:
            print(f"ERROR saving position: {e}")
            return False

    def load_position(self, word_offset=0):
        """Load position, optionally rewinding N words.  Returns 0 on error."""
        try:
            with open(self.position_file, 'r') as f:
                pos = int(f.read().strip())
            if word_offset > 0 and pos > 0:
                pos = self._go_back_n_words(pos, word_offset)
            return pos
        except:
            return 0

    def _go_back_n_words(self, byte_pos, n_words):
        try:
            if byte_pos == 0:
                return 0
            chunk_size = min(2048, byte_pos)
            start = byte_pos - chunk_size

            with open(self.filename, 'rb') as f:
                f.seek(start)
                chunk = f.read(chunk_size).decode('utf-8', 'ignore')

            words, positions, word = [], [], ""
            for i, c in enumerate(chunk):
                if c in ' \t\n\r':
                    if word:
                        words.append(word)
                        positions.append(start + i - len(word.encode('utf-8')))
                        word = ""
                else:
                    word += c
            if word:
                words.append(word)
                positions.append(start + len(chunk) - len(word.encode('utf-8')))

            if len(words) <= n_words:
                return max(0, start)
            idx = len(words) - n_words - 1
            return positions[idx] if idx >= 0 else 0
        except:
            return byte_pos

    def clear_position(self):
        try:
            import os
            os.remove(self.position_file)
            return True
        except:
            return False

    def get_file_size(self):
        try:
            import os
            return os.stat(self.filename)[6]
        except:
            return 0


class WordReader:
    """Streaming word reader - never loads full file into RAM."""

    def __init__(self, filename):
        self.filename = filename
        self.file = None
        self.buffer = ""
        self.chunk_size = 512
        self.eof = False
        self._carry = b""

    def open(self, byte_position=0, skip_boundary=True):
        try:
            self.file = open(self.filename, 'rb')
            self.buffer = ""
            self.eof = False
            self._carry = b""
            if byte_position > 0:
                self.file.seek(byte_position)
                if skip_boundary:
                    self._skip_to_word_boundary()
            return True
        except Exception as e:
            print(f"WordReader open error: {e}")
            return False

    def _decode_chunk(self, raw):
        """Decode bytes to str, carrying incomplete UTF-8 sequences to next read."""
        raw = self._carry + raw
        self._carry = b""
        # Find how many trailing bytes might be an incomplete sequence (max 3).
        # Walk back from the end to find a leading byte of a multi-byte char.
        trim = 0
        for i in range(1, min(4, len(raw) + 1)):
            b = raw[-i]
            if b >= 0xC0:
                # Leading byte found - check if sequence is complete.
                if b < 0xE0:
                    expected = 2
                elif b < 0xF0:
                    expected = 3
                else:
                    expected = 4
                if i < expected:
                    trim = i
                break
            elif b < 0x80:
                break  # ASCII - no incomplete sequence
        if trim:
            self._carry = raw[-trim:]
            raw = raw[:-trim]
        return raw.decode('utf-8', 'ignore')

    def _skip_to_word_boundary(self):
        while True:
            chunk = self.file.read(64)
            if not chunk:
                self.eof = True
                return
            text = self._decode_chunk(chunk)
            for i, c in enumerate(text):
                if c in ' \t\n\r':
                    self.buffer = text[i:].lstrip()
                    return

    def close(self):
        if self.file:
            self.file.close()
            self.file = None

    def get_position(self):
        if self.file:
            return self.file.tell() - len(self.buffer.encode('utf-8'))
        return 0

    def next_word(self):
        if not self.file:
            return None
        while True:
            self.buffer = self.buffer.lstrip()
            if self.buffer:
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
                    word = self.buffer
                    self.buffer = ""
                    return word if word else None
                elif len(self.buffer) > 1000:
                    word = self.buffer[:50]
                    self.buffer = self.buffer[50:]
                    return word
            elif self.eof:
                return None

            try:
                chunk = self.file.read(self.chunk_size)
                if not chunk:
                    # Flush any remaining carry bytes.
                    if self._carry:
                        self.buffer += self._carry.decode('utf-8', 'ignore')
                        self._carry = b""
                    self.eof = True
                    continue
                self.buffer += self._decode_chunk(chunk)
            except MemoryError:
                import gc
                print(f"WordReader MemoryError at pos {self.file.tell()}, buf={len(self.buffer)}, free={gc.mem_free()}")
                gc.collect()
                print(f"WordReader after gc free={gc.mem_free()}, retrying")
                try:
                    chunk = self.file.read(self.chunk_size)
                    if not chunk:
                        self.eof = True
                        continue
                    self.buffer += self._decode_chunk(chunk)
                except Exception as e:
                    print(f"WordReader MemoryError retry failed: {e}")
                    self.eof = True
                    return None
            except Exception as e:
                import gc
                print(f"WordReader read error at pos {self.file.tell()}, buf={len(self.buffer)}, free={gc.mem_free()}: {type(e).__name__}: {e}")
                self.eof = True
                return None
