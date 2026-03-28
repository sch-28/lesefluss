import machine
import st7789
import vga1_16x32 as font
import config

class DisplayManager:
    """Manages display operations"""
    
    def __init__(self):
        # Setup SPI
        self.spi = machine.SPI(
            2, 
            baudrate=config.DISPLAY_BAUDRATE,
            polarity=1,
            phase=1,
            sck=machine.Pin(config.PIN_SCK),
            mosi=machine.Pin(config.PIN_MOSI)
        )
        
        # Setup backlight
        self.backlight = machine.Pin(config.PIN_BACKLIGHT, machine.Pin.OUT)
        self.backlight.value(1)
        
        # Setup display
        self.display = st7789.ST7789(
            self.spi,
            config.DISPLAY_WIDTH,
            config.DISPLAY_HEIGHT,
            reset=machine.Pin(config.PIN_RESET, machine.Pin.OUT),
            cs=machine.Pin(config.PIN_CS, machine.Pin.OUT),
            dc=machine.Pin(config.PIN_DC, machine.Pin.OUT),
            backlight=self.backlight,
            rotation=config.DISPLAY_ROTATION
        )
        
        self.display.init([])
        self.font = font
        
    @property
    def width(self):
        return self.display.width
    
    @property
    def height(self):
        return self.display.height
    
    def clear(self):
        """Clear the screen to configured background color"""
        bg_color = config.BACKGROUND_COLOR if not config.INVERSE else (255, 255, 255)
        self.display.fill(st7789.color565(*bg_color))
    
    def show_text(self, text, x, y, color=(255, 255, 255), bg_color=(0, 0, 0), invert = True):
        """Draw text at specified position"""
        # Apply inverse if enabled (swap text and bg colors)
        if config.INVERSE and invert:
            color = tuple(255 - c for c in color)
            bg_color = tuple(255 - c for c in bg_color)
        fg = st7789.color565(*color)
        bg = st7789.color565(*bg_color)
        self.display.text(self.font, text, x, y, fg, bg)

    def show_centered_message(self, message, color=(255, 255, 255)):
        """Show a centered message on screen"""
        self.clear()
        text_width = len(message) * config.FONT_WIDTH
        x = (self.width - text_width) // 2
        y = (self.height - config.FONT_HEIGHT) // 2
        self.show_text(message, x, y, color)
    
    def show_word_centered(self, word):
        """Show a word with RSVP focal letter at configured X offset"""
        text_width = len(word) * config.FONT_WIDTH
        y = (self.height - config.FONT_HEIGHT) // 2
        
        # Get focal letter position
        focal_pos = config.get_focal_position(word)
        
        # Calculate x position based on X_OFFSET (30-70%)
        # X_OFFSET of 50% = center, 30% = left, 70% = right
        offset_position = int(self.width * (config.X_OFFSET / 100.0))
        focal_letter_center = focal_pos * config.FONT_WIDTH + config.FONT_WIDTH // 2
        x_start = offset_position - focal_letter_center
        
        # Get colors - show_text will handle inverse for normal text
        text_color = config.TEXT_COLOR
        bg_color = config.BACKGROUND_COLOR
        # Focal stays red regardless of inverse
        focal_color = config.FOCAL_LETTER_COLOR
        
        # Draw word in three parts: before focal, focal, after focal
        current_x = x_start
        
        # Part 1: Characters before focal letter
        if focal_pos > 0:
            before = word[:focal_pos]
            self.show_text(before, current_x, y, color=text_color, bg_color=bg_color)
            current_x += len(before) * config.FONT_WIDTH
        
        # Part 2: Focal letter (highlighted)
        # In normal mode: red text on black bg
        # In inverse mode: red text on white bg
        focal_letter = word[focal_pos]
        focal_bg = (255, 255, 255) if config.INVERSE else (0, 0, 0)
        self.show_text(focal_letter, current_x, y, color=focal_color, bg_color=focal_bg, invert=False)
        
        # Draw indicator lines above and below focal letter (keep red, don't inverse)
        focal_indicator = st7789.color565(*config.FOCAL_INDICATOR_COLOR)
        line_length = config.FONT_WIDTH
        self.display.vline(current_x + config.FONT_WIDTH // 2, y - 12, line_length, focal_indicator)  # Line above
        self.display.vline(current_x + config.FONT_WIDTH // 2, y + config.FONT_HEIGHT, line_length, focal_indicator)  # Line below
        
        current_x += config.FONT_WIDTH
        
        # Part 3: Characters after focal letter
        if focal_pos < len(word) - 1:
            after = word[focal_pos + 1:]
            self.show_text(after, current_x, y, color=text_color, bg_color=bg_color)
        
        # Return the bounding box for clearing later
        return x_start, text_width
    
    def clear_rect(self, x, y, width, height):
        """Clear a rectangular area"""
        bg_color = config.BACKGROUND_COLOR if not config.INVERSE else (255, 255, 255)
        self.display.fill_rect(x, y, width, height, st7789.color565(*bg_color))
    
    def show_pause_indicator(self, position):
        """Show pause indicator at bottom of screen with progress"""
        pause_msg = "PAUSED"
        pause_width = len(pause_msg) * config.FONT_WIDTH
        pause_x = (self.width - pause_width) // 2
        pause_y = self.height - 75
        self.show_text(pause_msg, pause_x, pause_y, color=(255, 255, 0))

        progress_width = len(position) * config.FONT_WIDTH
        progress_x = self.width - progress_width;
        progress_y = 40
        self.show_text(position, progress_x, progress_y, color=(255, 255, 0))
    
    def hide_pause_indicator(self):
        """Clear pause indicator and progress areas"""
        self.clear_rect(0, self.height - 75, self.width, 75)  # Clear both PAUSED and progress
        self.clear_rect(self.width - 100, 40, 100, 40)  # Clear progress area on top right
    
    def shutdown(self):
        """Turn off display to save power"""
        self.clear()
        self.backlight.value(0)
    
    def wakeup(self):
        """Turn on display"""
        self.backlight.value(1)
