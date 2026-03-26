# RSVP Reader Configuration

# Display settings
DISPLAY_WIDTH = 240
DISPLAY_HEIGHT = 320
DISPLAY_ROTATION = 3
DISPLAY_BAUDRATE = 40000000

# Pin configuration
PIN_SCK = 18
PIN_MOSI = 23
PIN_BACKLIGHT = 32
PIN_RESET = 4
PIN_CS = 15
PIN_DC = 2
PIN_BOOT_BUTTON = 0

# RSVP settings
WPM = 350  # Words per minute
AUTO_SHUTDOWN_TIMEOUT = 30000  # milliseconds (30 seconds)
CURRENT_SLOT = 1  # Current book slot (1-4)

# Punctuation delays (multiplier of base word delay)
# e.g., 1.5 means pause 50% longer than normal word
DELAY_COMMA = 2      # , ; :
DELAY_PERIOD = 3.0     # . ! ? (end of sentence)

# RSVP focal letter settings
FOCAL_LETTER_COLOR = (255, 0, 0)  # Red for focal letter
FOCAL_INDICATOR_COLOR = (175, 0, 0)  # Red for focal letter
TEXT_COLOR = (255, 255, 255)  # White for other letters
BACKGROUND_COLOR = (0, 0, 0)  # Black background

def get_focal_position(word):
    """Calculate the optimal focal letter position for a word"""
    length = len(word)
    if length == 1:
        return 0
    elif length == 2:
        return 0
    elif length <= 5:
        return 1
    elif length <= 9:
        return 2
    elif length <= 13:
        return 3
    else:
        return 4

# Font settings
FONT_WIDTH = 16  # pixels per character
FONT_HEIGHT = 32  # pixels

# Button debounce
BUTTON_DEBOUNCE_MS = 200

# Sample text for testing
SAMPLE_TEXT = """The quick brown fox jumps over the lazy dog. This is a test of the RSVP reader system. Reading at high speeds requires practice and concentration. Start slow and gradually increase your speed as you become more comfortable."""
