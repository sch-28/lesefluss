import machine
import config
font = __import__(config.FONT_FILE)


# Transliteration map: Latin extended → ASCII equivalents.
# The vga1_16x32 bitmap font only covers ASCII (0-127); any code point above
# 127 is rendered as garbage or skipped by the display driver.
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
    """Hardware-agnostic display operations.

    Supports ST7789 (SPI, PWM backlight) and RM67162 (QSPI, software brightness).
    Driver selection happens once in __init__ via config.HARDWARE; all public
    methods are identical across both drivers — no branching outside __init__.
    """

    _PWM_FREQ = 1000  # Hz — above flicker threshold (ST7789 only)

    def __init__(self):
        if config.HARDWARE == "AMOLED":
            import rm67162
            machine.Pin(config.PIN_LED, machine.Pin.OUT).value(0)  # display power enable — keep LOW to suppress green LED
            hspi = machine.SPI(2, sck=machine.Pin(config.PIN_SCK), mosi=None, miso=None)
            panel = rm67162.QSPIPanel(
                spi=hspi,
                data=(
                    machine.Pin(config.PIN_QSPI_D0),
                    machine.Pin(config.PIN_QSPI_D1),
                    machine.Pin(config.PIN_QSPI_D2),
                    machine.Pin(config.PIN_QSPI_D3),
                ),
                dc=machine.Pin(config.PIN_DC),
                cs=machine.Pin(config.PIN_CS),
                pclk=80_000_000,
                width=config.DISPLAY_HEIGHT,   # panel is portrait-native: 240
                height=config.DISPLAY_WIDTH,   # panel is portrait-native: 536
            )
            self.display = rm67162.RM67162(panel, reset=machine.Pin(config.PIN_RESET))
            self.display.reset()
            self.display.init()
            self.display.disp_on()
            self.display.rotation(config.DISPLAY_ROTATION)
            self.display.brightness(config.BRIGHTNESS)
            self._color   = self.display.colorRGB
            self._bl_pwm  = None
        else:  # ST7789
            import st7789
            self.spi = machine.SPI(
                2,
                baudrate=config.DISPLAY_BAUDRATE,
                polarity=1, phase=1,
                sck=machine.Pin(config.PIN_SCK),
                mosi=machine.Pin(config.PIN_MOSI),
            )
            # PWM backlight — allows variable brightness.
            # Do NOT pass to ST7789 constructor; it would call .value(1) and
            # override the duty cycle back to full brightness.
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
            self._color = st7789.color565

        # AMOLED: config.DISPLAY_WIDTH is already the logical (post-rotation) width (536).
        # ST7789: config.DISPLAY_WIDTH is the portrait panel width (240); after rotation=3
        # the driver reports 320, which is what centering math must use.
        if config.HARDWARE == "AMOLED":
            self._width = config.DISPLAY_WIDTH
        else:
            self._width = self.display.width   # 320 after rotation=3
        self._height = config.DISPLAY_PHYSICAL_HEIGHT
        self.font    = font

    # -- Internal helpers --------------------------------------------------

    def _set_duty(self, brightness_pct):
        """Convert 0-100% brightness to PWM duty (0-1023) and apply. ST7789 only."""
        pct = max(0, min(100, brightness_pct))
        self._bl_pwm.duty(int(pct * 1023 // 100))

    # -- Properties --------------------------------------------------------

    @property
    def width(self):
        return self._width

    @property
    def height(self):
        return self._height

    # -- Primitives --------------------------------------------------------

    def clear(self):
        bg = (255, 255, 255) if config.INVERSE else config.BACKGROUND_COLOR
        self.display.fill(self._color(*bg))

    def fill_rect(self, x, y, w, h, color):
        self.display.fill_rect(x, y + config.DISPLAY_Y_OFFSET, w, h, self._color(*color))

    def clear_rect(self, x, y, w, h):
        bg = (255, 255, 255) if config.INVERSE else config.BACKGROUND_COLOR
        # Clamp to valid screen bounds — fill_rect with out-of-bounds coords leaves residual pixels.
        x0 = max(0, x)
        x1 = min(self._width, x + w)
        if x1 <= x0:
            return
        self.display.fill_rect(x0, y + config.DISPLAY_Y_OFFSET, x1 - x0, h, self._color(*bg))

    def hline(self, x, y, length, color):
        self.display.hline(x, y + config.DISPLAY_Y_OFFSET, length, self._color(*color))

    def vline(self, x, y, length, color):
        self.display.vline(x, y + config.DISPLAY_Y_OFFSET, length, self._color(*color))

    # -- Text --------------------------------------------------------------

    def text(self, s, x, y, color=(255, 255, 255), bg=(0, 0, 0), invert=True):
        """Draw text. When *invert* is True, colours are auto-flipped in INVERSE mode."""
        if config.INVERSE and invert:
            color = tuple(255 - c for c in color)
            bg    = tuple(255 - c for c in bg)
        self.display.text(self.font, s, x, y + config.DISPLAY_Y_OFFSET,
                          self._color(*color), self._color(*bg))

    def centered_text(self, s, y, color=(255, 255, 255), bg=(0, 0, 0)):
        x = (self._width - len(s) * config.FONT_WIDTH) // 2
        self.text(s, x, y, color, bg)

    def show_centered_message(self, message, color=(255, 255, 255)):
        self.clear()
        y = (self._height - config.FONT_HEIGHT) // 2
        self.centered_text(message, y, color)

    # -- RSVP word rendering -----------------------------------------------

    def show_word(self, word):
        """Draw a word with focal-letter highlighting. Returns (x_start, width)."""
        word = _ascii_safe(word)
        y = (self._height - config.FONT_HEIGHT) // 2
        focal_pos = config.get_focal_position(word)

        offset_px    = int(self._width * (config.X_OFFSET / 100.0))
        focal_center = focal_pos * config.FONT_WIDTH + config.FONT_WIDTH // 2
        x = offset_px - focal_center

        tc = config.TEXT_COLOR
        bg = config.BACKGROUND_COLOR
        fc = config.FOCAL_LETTER_COLOR

        if focal_pos > 0:
            self.text(word[:focal_pos], x, y, color=tc, bg=bg)

        fx       = x + focal_pos * config.FONT_WIDTH
        focal_bg = (255, 255, 255) if config.INVERSE else (0, 0, 0)
        self.text(word[focal_pos], fx, y, color=fc, bg=focal_bg, invert=False)

        if config.SHOW_FOCAL_INDICATORS:
            ic = config.FOCAL_INDICATOR_COLOR
            cx = fx + config.FONT_WIDTH // 2
            self.vline(cx, y - 12 - config.FONT_HEIGHT // 4, config.FONT_WIDTH, ic)
            self.vline(cx, y + config.FONT_HEIGHT, config.FONT_WIDTH, ic)

        ax = fx + config.FONT_WIDTH
        if focal_pos < len(word) - 1:
            self.text(word[focal_pos + 1:], ax, y, color=tc, bg=bg)

        return x, len(word) * config.FONT_WIDTH

    def clear_word(self, x, width):
        """Clear a previously drawn word area."""
        if width > 0:
            y = (self._height - config.FONT_HEIGHT) // 2
            self.clear_rect(x, y, width, config.FONT_HEIGHT)

    # -- Power -------------------------------------------------------------

    def set_brightness(self, brightness_pct):
        """Apply new brightness (0-100%) immediately and persist to config."""
        config.BRIGHTNESS = max(0, min(100, brightness_pct))
        if self._bl_pwm is not None:
            self._set_duty(config.BRIGHTNESS)
        else:
            self.display.brightness(config.BRIGHTNESS)

    def shutdown(self):
        self.clear()
        if self._bl_pwm is not None:
            self._bl_pwm.duty(0)
        else:
            self.display.brightness(0)
            self.display.disp_off()

    def wakeup(self):
        if self._bl_pwm is not None:
            self._set_duty(config.BRIGHTNESS)
        else:
            self.display.disp_on()
            self.display.brightness(config.BRIGHTNESS)
