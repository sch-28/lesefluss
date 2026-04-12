# RSVP Reader boot script
# This file runs automatically on ESP32 startup
# Create a file called "devmode" to skip auto-start (for development)

import os

# Check for dev mode
try:
    os.stat('devmode')
    print("Dev mode enabled - auto-start disabled")
    print("Delete 'devmode' file via web interface to enable auto-start")
    
    # Show dev mode message on display (ST7789 only — AMOLED keeps screen off to avoid burn-in)
    try:
        import sys
        sys.path.append('/src')
        sys.path.append('src')
        import config
        if config.HARDWARE != "AMOLED":
            from hw.display import DisplayManager
            display = DisplayManager()
            display.show_centered_message("DEV MODE")
    except:
        pass  # If display fails, just continue
    
    # Just drop to REPL - don't exit boot.py
    # MicroPython will show the REPL prompt
        
except:
    # Dev mode not enabled, run normally
    try:
        import main
        main.main()
    except KeyboardInterrupt:
        print("Startup cancelled")
    except Exception as e:
        print(f"Error starting application: {e}")
        import sys
        sys.print_exception(e)
