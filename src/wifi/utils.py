import os

# Global display reference for logging
_display = None

def set_display(display):
    """Set the display for log output"""
    global _display
    _display = display

def log(msg):
    """Print to console and show on display"""
    print(msg)
    if _display:
        _display.show_centered_message(str(msg)[:20])


def get_disk_space():
    """Get disk space information"""
    try:
        stat = os.statvfs('/')
        block_size = stat[0]
        total_blocks = stat[2]
        free_blocks = stat[3]
        total_mb = (total_blocks * block_size) / (1024 * 1024)
        free_mb = (free_blocks * block_size) / (1024 * 1024)
        return {
            'total': total_mb,
            'free': free_mb,
            'percent': ((total_mb - free_mb) / total_mb) * 100
        }
    except:
        return None


def parse_post_data(data):
    """Parse URL-encoded POST data"""
    try:
        body_start = data.find(b'\r\n\r\n')
        if body_start == -1:
            return None
        
        body = data[body_start + 4:].decode('utf-8', 'ignore')
        
        result = {}
        for pair in body.split('&'):
            if '=' in pair:
                key, value = pair.split('=', 1)
                value = value.replace('+', ' ')
                value = value.replace('%0D%0A', '\n')
                value = value.replace('%0A', '\n')
                value = value.replace('%20', ' ')
                result[key] = value
        
        return result
    except:
        return None


def save_config(config):
    """Save config overrides to file"""
    try:
        with open('config_override.py', 'w') as f:
            f.write("# Auto-generated config overrides\n")
            f.write(f"WPM = {config.WPM}\n")
            f.write(f"CURRENT_SLOT = {config.CURRENT_SLOT}\n")
            f.write(f"DELAY_COMMA = {config.DELAY_COMMA}\n")
            f.write(f"DELAY_PERIOD = {config.DELAY_PERIOD}\n")
        return True
    except:
        return False
