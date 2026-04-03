"""Homescreen and transfer-progress drawing.

Owns all the 'screen layout' logic so the state machine stays clean.
Only depends on hw.display (DisplayManager) and config.
"""

import config


def _bg():
    return (255, 255, 255) if config.INVERSE else config.BACKGROUND_COLOR

def _fg():
    return (0, 0, 0) if config.INVERSE else config.TEXT_COLOR

def _dim():
    return (100, 100, 100) if config.INVERSE else (120, 120, 120)

def _track():
    return (200, 200, 200) if config.INVERSE else (50, 50, 50)

def _bar_fill():
    return (0, 0, 0) if config.INVERSE else (255, 255, 255)


# ======================================================================
# Homescreen
# ======================================================================

def draw_homescreen(display, title, progress_pct, wpm):
    """Minimal homescreen.

    Layout (320 x 170 visible, font 16 x 32):
      y=8    book title, centred
      y=72   progress bar (12 px)
      y=90   '42%  350 wpm' centred, dim
      y=132  'press to read' centred
    All y values are relative to the visible top (DISPLAY_Y_OFFSET applied in DisplayManager).
    """
    display.clear()
    bg = _bg()
    fg = _fg()
    dim = _dim()

    # -- title -----------------------------------------------------------
    max_ch = display.width // config.FONT_WIDTH
    t = title if title else "No book"
    if len(t) > max_ch:
        t = t[:max_ch - 1] + "\x7e"   # tilde as ellipsis
    display.centered_text(t, 8, color=fg, bg=bg)

    # -- progress bar ----------------------------------------------------
    _draw_bar(display, 72, progress_pct)

    # -- stats line ------------------------------------------------------
    stats = f"{progress_pct}%  {wpm} wpm"
    display.centered_text(stats, 90, color=dim, bg=bg)

    # -- action hint -----------------------------------------------------
    display.centered_text("press to read", 132, color=(180, 180, 180) if not config.INVERSE else (80, 80, 80), bg=bg)


def _draw_bar(display, y, pct):
    """12 px progress bar, full width with 16 px padding each side."""
    bg = _bg()
    x = 16
    w = display.width - 32
    h = 12
    filled = int(w * max(0, min(100, pct)) / 100)

    display.fill_rect(x, y, w, h, _track())
    if filled > 0:
        display.fill_rect(x, y, filled, h, _bar_fill())


# ======================================================================
# Transfer progress overlay
# ======================================================================

_last_pct = None   # module-level so we can skip redundant redraws


def draw_transfer_progress(display, pct, bytes_done, total_bytes):
    """Full-screen transfer progress.  Redraws only dynamic parts."""
    global _last_pct
    bg = _bg()
    fg = _fg()
    dim = _dim()

    if _last_pct is None:
        display.clear()
        display.centered_text("Receiving", 20, color=fg, bg=bg)
        _last_pct = -1

    if pct == _last_pct:
        return
    _last_pct = pct

    # Bar
    _draw_bar(display, 68, pct)

    # Labels
    display.fill_rect(0, 86, display.width, config.FONT_HEIGHT, bg)
    pct_str = f"{pct}%"
    if total_bytes > 0:
        size_str = f"{bytes_done // 1024}K / {total_bytes // 1024}K"
    else:
        size_str = ""
    label = f"{pct_str}  {size_str}" if size_str else pct_str
    display.centered_text(label, 88, color=dim, bg=bg)


def clear_transfer_state():
    global _last_pct
    _last_pct = None
