import time
from .utils import parse_post_data, get_disk_space, save_config, log

def handle_request(client, storage, config, wifi):
    """Handle incoming HTTP request"""
    try:
        client.setblocking(True)
        request = client.recv(1024)
        
        if not request:
            return None
        
        req = request.decode('utf-8', 'ignore')
        
        # Ignore non-HTTP
        if not req.strip() or not ('GET' in req or 'POST' in req):
            return None
        
        # Reject favicon
        if 'favicon' in req:
            client.send(b"HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n")
            return None
        
        print(f"Request: {req[:30]}...")
        
        # Route request
        if 'POST /upload' in req:
            return handle_upload(client, request, req, storage)
        elif 'POST /save_config' in req:
            return handle_save_config(client, request, config)
        elif 'POST /set_position' in req:
            return handle_set_position(client, request, storage)
        elif 'POST /delete_book' in req:
            return handle_delete_book(client, storage)
        elif 'POST /toggle_devmode' in req:
            return handle_toggle_devmode(client)
        elif 'POST /shutdown' in req:
            return handle_shutdown(client)
        else:
            return handle_get(client, storage, config)
            
    except OSError as e:
        print(f"OSError: {e}")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        try:
            client.close()
        except:
            pass
        time.sleep(0.2)
    
    return None


def handle_get(client, storage, config):
    """Serve the main page"""
    print("Handling GET...")
    try:
        client.send(b"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nConnection: close\r\n\r\n")
        stream_html(client, storage, config)
        print("Sent OK")
    except Exception as e:
        print(f"Send error: {e}")
    return None


def handle_upload(client, request, req_str, storage):
    """Handle file upload with streaming"""
    log("Uploading...")
    
    # Get content length
    content_length = 0
    for line in req_str.split('\r\n'):
        if line.lower().startswith('content-length:'):
            content_length = int(line.split(':')[1].strip())
            break
    
    # Get boundary
    boundary = None
    for line in req_str.split('\r\n'):
        if 'boundary=' in line:
            boundary = '--' + line.split('boundary=')[1].strip()
            break
    
    if not boundary:
        client.send(b"HTTP/1.1 400 Bad Request\r\n\r\nNo boundary")
        return None
    
    # Find file content start
    header_end = request.find(b'\r\n\r\n', request.find(b'filename='))
    if header_end == -1:
        client.send(b"HTTP/1.1 400 Bad Request\r\n\r\nBad format")
        return None
    
    received = len(request)
    file_start = header_end + 4
    boundary_bytes = boundary.encode()
    
    try:
        with open(storage.filename, 'wb') as f:
            chunk = request[file_start:]
            
            while received < content_length:
                new_data = client.recv(4096)
                if not new_data:
                    break
                received += len(new_data)
                chunk += new_data
                
                # Check for end boundary
                boundary_pos = chunk.find(boundary_bytes)
                if boundary_pos != -1:
                    end = boundary_pos
                    if end >= 2 and chunk[end-2:end] == b'\r\n':
                        end -= 2
                    f.write(chunk[:end])
                    break
                else:
                    # Write safe portion
                    safe = len(chunk) - len(boundary_bytes) - 10
                    if safe > 0:
                        f.write(chunk[:safe])
                        chunk = chunk[safe:]
        
        storage.save_position(0)
        log(f"Uploaded {received//1024}KB")
        client.send(b"HTTP/1.1 302 Found\r\nLocation: /\r\n\r\n")
    except Exception as e:
        import sys
        print(f"Upload error: {e}")
        sys.print_exception(e)
        log("Upload failed")
        client.send(b"HTTP/1.1 500 Error\r\n\r\nUpload failed")
    
    return None


def handle_save_config(client, request, config):
    """Save WPM and delay settings"""
    data = parse_post_data(request)
    if data:
        try:
            if 'wpm' in data:
                wpm = int(data['wpm'])
                if 100 <= wpm <= 1000:
                    config.WPM = wpm
            if 'delay_comma' in data:
                val = float(data['delay_comma'])
                if 1.0 <= val <= 5.0:
                    config.DELAY_COMMA = val
            if 'delay_period' in data:
                val = float(data['delay_period'])
                if 1.0 <= val <= 5.0:
                    config.DELAY_PERIOD = val
            if 'accel_start' in data:
                val = float(data['accel_start'])
                if 1.0 <= val <= 5.0:
                    config.ACCEL_START = val
            if 'accel_rate' in data:
                val = float(data['accel_rate'])
                if 0.05 <= val <= 1.0:
                    config.ACCEL_RATE = val
            if 'x_offset' in data:
                val = int(data['x_offset'])
                if 30 <= val <= 70:
                    config.X_OFFSET = val
            if 'word_offset' in data:
                val = int(data['word_offset'])
                if 0 <= val <= 20:
                    config.WORD_OFFSET = val
            # Checkbox: present if checked, absent if unchecked
            config.INVERSE = 'inverse' in data
            config.BLE_ON = 'ble_on' in data
            save_config(config)
            log(f"Saved {config.WPM}WPM")
        except:
            pass
    client.send(b"HTTP/1.1 302 Found\r\nLocation: /\r\n\r\n")
    return None


def handle_select_slot(client, request, config, wifi):
    """Slot switching removed — single book model. Kept as stub to avoid 404s from cached pages."""
    client.send(b"HTTP/1.1 302 Found\r\nLocation: /\r\n\r\n")
    return None


def handle_set_position(client, request, storage):
    """Set reading position from percentage (stored as byte position)"""
    data = parse_post_data(request)
    if data and 'percent' in data:
        try:
            percent = int(data['percent'])
            if 0 <= percent <= 100:
                # Calculate byte position from percentage
                file_size = storage.get_file_size()
                byte_pos = (percent * file_size) // 100
                storage.save_position(byte_pos)
                log(f"Position {percent}%")
        except Exception as e:
            print(f"set_position error: {e}")
    client.send(b"HTTP/1.1 302 Found\r\nLocation: /\r\n\r\n")
    return None


def handle_delete_book(client, storage):
    """Delete current book"""
    storage.delete_text()
    storage.clear_position()
    log("Book deleted")
    client.send(b"HTTP/1.1 302 Found\r\nLocation: /\r\n\r\n")
    return None


def handle_toggle_devmode(client):
    """Toggle dev mode"""
    import os
    try:
        os.stat('devmode')
        os.remove('devmode')
        log("Dev mode OFF")
    except:
        with open('devmode', 'w') as f:
            f.write('1')
        log("Dev mode ON")
    client.send(b"HTTP/1.1 302 Found\r\nLocation: /\r\n\r\n")
    return None


def handle_shutdown(client):
    """Shutdown server"""
    log("Exiting WiFi")
    client.send(b"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n")
    client.send(b"<html><body><h1>Exiting WiFi Mode</h1></body></html>")
    return 'shutdown'


def get_book_size():
    """Get formatted size for current book"""
    import os
    try:
        size = os.stat("book.txt")[6]
        return f"{size // 1024} KB" if size >= 1024 else f"{size} B"
    except:
        return "empty"


def stream_html(sock, storage, config):
    """Stream HTML template with replacements"""
    import os
    
    space = get_disk_space()
    space_info = f"{space['free']:.2f} MB free" if space else "Unknown"
    
    wpm = config.WPM
    pos = storage.load_position()
    
    # Get current book size and calculate percentage from byte position
    try:
        file_size = storage.get_file_size()
        book_size = f"{file_size // 1024} KB" if file_size >= 1024 else f"{file_size} B"
        percent = round(pos * 100 / file_size) if file_size > 0 else 0
    except:
        book_size = "empty"
        file_size = 0
        percent = 0
    
    # Check devmode
    try:
        os.stat('devmode')
        devmode_status = "Enabled"
        devmode_button = "Disable Dev Mode"
    except:
        devmode_status = "Disabled"
        devmode_button = "Enable Dev Mode"
    
    replacements = {
        '{space_info}': space_info,
        '{current_wpm}': str(wpm),
        '{delay_comma}': str(config.DELAY_COMMA),
        '{delay_period}': str(config.DELAY_PERIOD),
        '{accel_start}': str(config.ACCEL_START),
        '{accel_rate}': str(config.ACCEL_RATE),
        '{x_offset}': str(config.X_OFFSET),
        '{word_offset}': str(getattr(config, 'WORD_OFFSET', 0)),
        '{inverse_checked}': 'checked' if config.INVERSE else '',
        '{ble_checked}': 'checked' if getattr(config, 'BLE_ON', True) else '',
        '{current_percent}': str(percent),
        '{book_size}': book_size,
        '{devmode_status}': devmode_status,
        '{devmode_button}': devmode_button,
    }
    
    try:
        with open('web_template.html', 'r') as f:
            for line in f:
                for key, val in replacements.items():
                    if key in line:
                        line = line.replace(key, val)
                sock.send(line.encode())
    except Exception as e:
        print(f"Template error: {e}")
        sock.send(b"<h1>Error loading template</h1>")
