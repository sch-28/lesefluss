import machine
import st7789
import vga1_16x32 as font
import config


class DisplayManager:
    """Low-level ST7789 display operations.

    Handles SPI init, text drawing, color inversion, and rect fills.
    Higher-level screens (homescreen, transfer progress) live in app/.
    """

    def __init__(self):
        self.spi = machine.SPI(
            2,
            baudrate=config.DISPLAY_BAUDRATE,
            polarity=1, phase=1,
            sck=machine.Pin(config.PIN_SCK),
            mosi=machine.Pin(config.PIN_MOSI),
        )

        self.backlight = machine.Pin(config.PIN_BACKLIGHT, machine.Pin.OUT)
        self.backlight.value(1)

        self.display = st7789.ST7789(
            self.spi,
            config.DISPLAY_WIDTH,
            config.DISPLAY_HEIGHT,
            reset=machine.Pin(config.PIN_RESET, machine.Pin.OUT),
            cs=machine.Pin(config.PIN_CS, machine.Pin.OUT),
            dc=machine.Pin(config.PIN_DC, machine.Pin.OUT),
            backlight=self.backlight,
            rotation=config.DISPLAY_ROTATION,
        )
        self.display.init([])
        self.font = font

    # -- Properties --------------------------------------------------------

    @property
    def width(self):
        return self.display.width

    @property
    def height(self):
        return self.display.height

    # -- Primitives --------------------------------------------------------

    def clear(self):
        bg = (255, 255, 255) if config.INVERSE else config.BACKGROUND_COLOR
        self.display.fill(st7789.color565(*bg))

    def fill_rect(self, x, y, w, h, color):
        self.display.fill_rect(x, y + config.DISPLAY_Y_OFFSET, w, h, st7789.color565(*color))

    def clear_rect(self, x, y, w, h):
        bg = (255, 255, 255) if config.INVERSE else config.BACKGROUND_COLOR
        self.display.fill_rect(x, y + config.DISPLAY_Y_OFFSET, w, h, st7789.color565(*bg))

    def hline(self, x, y, length, color):
        self.display.hline(x, y + config.DISPLAY_Y_OFFSET, length, st7789.color565(*color))

    def vline(self, x, y, length, color):
        self.display.vline(x, y + config.DISPLAY_Y_OFFSET, length, st7789.color565(*color))

    # -- Text --------------------------------------------------------------

    def text(self, s, x, y, color=(255, 255, 255), bg=(0, 0, 0), invert=True):
        """Draw text.  When *invert* is True, colours are auto-flipped if INVERSE mode."""
        if config.INVERSE and invert:
            color = tuple(255 - c for c in color)
            bg = tuple(255 - c for c in bg)
        self.display.text(self.font, s, x, y + config.DISPLAY_Y_OFFSET,
                          st7789.color565(*color), st7789.color565(*bg))

    def centered_text(self, s, y, color=(255, 255, 255), bg=(0, 0, 0)):
        x = (self.width - len(s) * config.FONT_WIDTH) // 2
        self.text(s, x, y, color, bg)

    def show_centered_message(self, message, color=(255, 255, 255)):
        self.clear()
        y = (config.DISPLAY_PHYSICAL_HEIGHT - config.FONT_HEIGHT) // 2
        self.centered_text(message, y, color)

    # -- RSVP word rendering -----------------------------------------------

    def show_word(self, word):
        """Draw a word with focal-letter highlighting.  Returns (x_start, width)."""
        y = (config.DISPLAY_PHYSICAL_HEIGHT - config.FONT_HEIGHT) // 2
        focal_pos = config.get_focal_position(word)

        offset_px = int(self.width * (config.X_OFFSET / 100.0))
        focal_center = focal_pos * config.FONT_WIDTH + config.FONT_WIDTH // 2
        x = offset_px - focal_center

        tc = config.TEXT_COLOR
        bg = config.BACKGROUND_COLOR
        fc = config.FOCAL_LETTER_COLOR

        # Before focal letter
        if focal_pos > 0:
            self.text(word[:focal_pos], x, y, color=tc, bg=bg)

        # Focal letter (red, never colour-inverted)
        fx = x + focal_pos * config.FONT_WIDTH
        focal_bg = (255, 255, 255) if config.INVERSE else (0, 0, 0)
        self.text(word[focal_pos], fx, y, color=fc, bg=focal_bg, invert=False)

        # Indicator lines
        ic = config.FOCAL_INDICATOR_COLOR
        cx = fx + config.FONT_WIDTH // 2
        self.vline(cx, y - 12, config.FONT_WIDTH, ic)
        self.vline(cx, y + config.FONT_HEIGHT, config.FONT_WIDTH, ic)

        # After focal letter
        ax = fx + config.FONT_WIDTH
        if focal_pos < len(word) - 1:
            self.text(word[focal_pos + 1:], ax, y, color=tc, bg=bg)

        return x, len(word) * config.FONT_WIDTH

    def clear_word(self, x, width):
        """Clear a previously drawn word area."""
        if width > 0:
            y = (config.DISPLAY_PHYSICAL_HEIGHT - config.FONT_HEIGHT) // 2
            self.clear_rect(x, y, width, config.FONT_HEIGHT)

    # -- Power -------------------------------------------------------------

    def shutdown(self):
        self.clear()
        self.backlight.value(0)

    def wakeup(self):
        self.backlight.value(1)
