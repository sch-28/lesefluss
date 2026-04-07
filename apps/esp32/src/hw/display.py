import machine
import st7789
import vga1_16x32 as font
import config


# Transliteration map: Latin extended → ASCII equivalents.
# The vga1_16x32 bitmap font only covers ASCII (0-127); any code point above
# 127 is rendered as garbage or skipped by the ST7789 driver.
_TRANSLITERATE = {
    '\xe0': 'a', '\xe1': 'a', '\xe2': 'a', '\xe3': 'a', '\xe4': 'a', '\xe5': 'a',
    '\xc0': 'A', '\xc1': 'A', '\xc2': 'A', '\xc3': 'A', '\xc4': 'A', '\xc5': 'A',
    '\xe6': 'ae', '\xc6': 'AE',
    '\xe7': 'c', '\xc7': 'C',
    '\xe8': 'e', '\xe9': 'e', '\xea': 'e', '\xeb': 'e',
    '\xc8': 'E', '\xc9': 'E', '\xca': 'E', '\xcb': 'E',
    '\xec': 'i', '\xed': 'i', '\xee': 'i', '\xef': 'i',
    '\xcc': 'I', '\xcd': 'I', '\xce': 'I', '\xcf': 'I',
    '\xf0': 'd', '\xd0': 'D',
    '\xf1': 'n', '\xd1': 'N',
    '\xf2': 'o', '\xf3': 'o', '\xf4': 'o', '\xf5': 'o', '\xf6': 'o',
    '\xd2': 'O', '\xd3': 'O', '\xd4': 'O', '\xd5': 'O', '\xd6': 'O',
    '\xf8': 'o', '\xd8': 'O',
    '\xf9': 'u', '\xfa': 'u', '\xfb': 'u', '\xfc': 'u',
    '\xd9': 'U', '\xda': 'U', '\xdb': 'U', '\xdc': 'U',
    '\xfd': 'y', '\xff': 'y', '\xdd': 'Y',
    '\xfe': 'th', '\xde': 'TH',
    '\xdf': 'ss',
    '\u2018': "'", '\u2019': "'",
    '\u201c': '"', '\u201d': '"',
    '\u2013': '-', '\u2014': '--',
    '\u2026': '...',
}


def _ascii_safe(text):
    """Replace non-ASCII characters with ASCII equivalents for the bitmap font."""
    if all(ord(c) < 128 for c in text):
        return text
    out = []
    for c in text:
        if ord(c) < 128:
            out.append(c)
        else:
            out.append(_TRANSLITERATE.get(c, '?'))
    return ''.join(out)

class DisplayManager:
    """Low-level ST7789 display operations.

    Handles SPI init, text drawing, color inversion, and rect fills.
    Higher-level screens (homescreen, transfer progress) live in app/.
    """

    _PWM_FREQ = 1000  # Hz — above flicker threshold

    def __init__(self):
        self.spi = machine.SPI(
            2,
            baudrate=config.DISPLAY_BAUDRATE,
            polarity=1, phase=1,
            sck=machine.Pin(config.PIN_SCK),
            mosi=machine.Pin(config.PIN_MOSI),
        )

        # PWM backlight — allows variable brightness (10-100%)
        # Do NOT pass to ST7789 constructor; the driver would call .value(1)
        # and override the duty cycle back to full brightness.
        self._bl_pwm = machine.PWM(
            machine.Pin(config.PIN_BACKLIGHT, machine.Pin.OUT),
            freq=self._PWM_FREQ,
        )
        self._set_duty(config.BRIGHTNESS)

        self.display = st7789.ST7789(
            self.spi,
            config.DISPLAY_WIDTH,
            config.DISPLAY_HEIGHT,
            reset=machine.Pin(config.PIN_RESET, machine.Pin.OUT),
            cs=machine.Pin(config.PIN_CS, machine.Pin.OUT),
            dc=machine.Pin(config.PIN_DC, machine.Pin.OUT),
            rotation=config.DISPLAY_ROTATION,
        )
        self.display.init([])
        self.font = font

    def _set_duty(self, brightness_pct):
        """Convert 0-100% brightness to PWM duty (0-1023) and apply."""
        pct = max(0, min(100, brightness_pct))
        self._bl_pwm.duty(int(pct * 1023 // 100))

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
        # Clamp to valid screen bounds — fill_rect with negative x or width
        # extending beyond the screen silently clips, leaving residual pixels.
        x0 = max(0, x)
        x1 = min(self.width, x + w)
        if x1 <= x0:
            return
        self.display.fill_rect(x0, y + config.DISPLAY_Y_OFFSET, x1 - x0, h, st7789.color565(*bg))

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
        word = _ascii_safe(word)
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

    def set_brightness(self, brightness_pct):
        """Apply new brightness (0-100%) immediately and persist to config."""
        config.BRIGHTNESS = max(0, min(100, brightness_pct))
        self._set_duty(config.BRIGHTNESS)

    def shutdown(self):
        self.clear()
        self._bl_pwm.duty(0)

    def wakeup(self):
        self._set_duty(config.BRIGHTNESS)
