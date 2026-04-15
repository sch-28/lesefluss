# Lesefluss Configuration

HARDWARE = "AMOLED"

# ---------------------------------------------------------------------------
# Hardware-specific constants
# ---------------------------------------------------------------------------

if HARDWARE == "AMOLED":
    # LilyGO T-Display-S3 AMOLED (RM67162, QSPI, ESP32-S3)
    PIN_SCK          = 47
    PIN_CS           = 6
    PIN_DC           = 7    # shared with QSPI D1 — managed internally by the QSPI bus layer
    PIN_RESET        = 17
    PIN_LED          = 38   # must be pulled HIGH before display init
    PIN_QSPI_D0      = 18
    PIN_QSPI_D1      = 7
    PIN_QSPI_D2      = 48
    PIN_QSPI_D3      = 5
    PIN_BOOT_BUTTON  = 21   # IO21 — matches button position after 180° rotation
    DISPLAY_WIDTH    = 536
    DISPLAY_HEIGHT   = 240
    DISPLAY_Y_OFFSET = 0
    DISPLAY_ROTATION = 3    # 180° from rotation 1 — matches ST7789 orientation
    DISPLAY_PHYSICAL_HEIGHT = 240
    BRIGHTNESS       = 60   # lower default — AMOLED longevity
    SHOW_FOCAL_INDICATORS = True
    FONT_FILE        = "font_dejavu_24x40"
    FONT_WIDTH       = 24
    FONT_HEIGHT      = 40
else:  # ST7789
    # Original ESP32 + ST7789 SPI display
    PIN_SCK          = 18
    PIN_MOSI         = 23
    PIN_BACKLIGHT    = 32
    PIN_RESET        = 4
    PIN_CS           = 15
    PIN_DC           = 2
    PIN_BOOT_BUTTON  = 0
    PIN_ENCODER_CLK  = 26
    PIN_ENCODER_DT   = 33
    PIN_ENCODER_SW   = 25
    DISPLAY_BAUDRATE = 40000000
    DISPLAY_WIDTH    = 240
    DISPLAY_HEIGHT   = 320
    DISPLAY_Y_OFFSET = 35
    DISPLAY_ROTATION = 3
    DISPLAY_PHYSICAL_HEIGHT = 170
    BRIGHTNESS       = 100
    SHOW_FOCAL_INDICATORS = True
    FONT_FILE    = "vga1_16x32"
    FONT_WIDTH   = 16
    FONT_HEIGHT  = 32

# ---------------------------------------------------------------------------
# RSVP settings
# ---------------------------------------------------------------------------

WPM = 350
AUTO_SHUTDOWN_TIMEOUT = 60000   # ms until display turns off (60 s)
DEEP_SLEEP_TIMEOUT    = 120000  # ms until deep sleep after last activity (120 s)

DELAY_COMMA  = 2     # , ; :
DELAY_PERIOD = 3.0   # . ! ? — end of sentence

ACCEL_START = 2.0    # Initial delay multiplier (2.0 = start at half speed)
ACCEL_RATE  = 0.1    # Rate to reach full speed (0.1 = 10 words)

X_OFFSET    = 50     # Focal letter horizontal position (30–70%)
INVERSE     = False  # Inverse colors (True = black on white)
WORD_OFFSET = 5      # Words to rewind on resume (0–20)

BLE_ON = True        # Enable BLE for companion app

# ---------------------------------------------------------------------------
# Colors
# ---------------------------------------------------------------------------

FOCAL_LETTER_COLOR    = (255, 0, 0)
FOCAL_INDICATOR_COLOR = (175, 0, 0)
TEXT_COLOR            = (255, 255, 255)
BACKGROUND_COLOR      = (0, 0, 0)

# ---------------------------------------------------------------------------
# Scrub / button
# ---------------------------------------------------------------------------

SCRUB_AUTO_START_MS = 3000   # ms of inactivity in scrub before auto-starting RSVP
BUTTON_DEBOUNCE_MS  = 200

# ---------------------------------------------------------------------------
# Focal position table
# ---------------------------------------------------------------------------

def get_focal_position(word):
    """Optimal reading focal letter index for a word."""
    length = len(word)
    if length <= 2:
        return 0
    elif length <= 5:
        return 1
    elif length <= 9:
        return 2
    elif length <= 13:
        return 3
    else:
        return 4

# ---------------------------------------------------------------------------
# Sample text
# ---------------------------------------------------------------------------

SAMPLE_TEXT = """The quick brown fox jumps over the lazy dog. This is a test of the RSVP reader system. Reading at high speeds requires practice and concentration. Start slow and gradually increase your speed as you become more comfortable."""
