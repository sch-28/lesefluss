#!/usr/bin/env python3
"""
Generate Lesefluss RSVP word flash frames for Blender texture.
Output resolution: 1072×500 (matches screen mesh aspect ratio)

Usage:
    pip install Pillow
    python gen_rsvp.py
    ffmpeg -framerate 30 -i frames_rsvp/frame_%04d.png -c:v libx264 -pix_fmt yuv420p rsvp.mp4

In Blender: Image Texture node → open rsvp.mp4 → set to "Movie" → enable "Auto Refresh"
"""

from PIL import Image, ImageDraw, ImageFont
import os

# ── Config ────────────────────────────────────────────────────────────────────
W, H   = 1072, 500
FPS    = 30
BG     = (0, 0, 0)
FG     = (235, 235, 235)
ACC    = (255, 165, 0)    # ORP highlight (amber)

FONT = "/usr/share/fonts/TTF/DejaVuSansMono.ttf"
FONT_BOLD = "/usr/share/fonts/TTF/DejaVuSansMono-Bold.ttf"

font_word = ImageFont.truetype(FONT_BOLD, 88)
font_wpm  = ImageFont.truetype(FONT, 22)

os.makedirs("frames_rsvp", exist_ok=True)
frame_n = 0

# ── Helpers ───────────────────────────────────────────────────────────────────
def emit(img):
    global frame_n
    img.save(f"frames_rsvp/frame_{frame_n:04d}.png")
    frame_n += 1

def blank():
    return Image.new("RGB", (W, H), BG)

def orp_idx(word):
    n = len(word)
    if n <= 1: return 0
    if n <= 5: return 1
    if n <= 9: return 2
    return 3

def lerp_color(c, alpha):
    return tuple(int(v * alpha) for v in c)

# ── RSVP word flash ──────────────────────────────────────────────────────────
WPM = 260
WORD_MS     = 60000 / WPM
WORD_FRAMES = max(7, int(FPS * WORD_MS / 1000))

SENTENCE = (
    "He was an old man who fished alone in a skiff in the Gulf Stream "
    "and he had gone eighty-four days now without taking a fish. In the "
    "first forty days a boy had been with him. But after forty days "
    "without a fish the boy's parents had told him that the old man was "
    "now definitely and finally salao, which is the worst form of "
    "unlucky, and the boy had gone at their orders in another boat "
    "which caught three good fish the first week."
).split()

def render_word(word, t_frac, word_i, total_words):
    img = blank()
    d = ImageDraw.Draw(img)

    # fade: sharp in, gentle out
    if t_frac < 0.07:
        alpha = t_frac / 0.07
    elif t_frac > 0.82:
        alpha = (1.0 - t_frac) / 0.18
    else:
        alpha = 1.0
    alpha = max(0.0, min(1.0, alpha))

    orp = orp_idx(word)
    chars = list(word)
    widths = [d.textlength(c, font=font_word) for c in chars]

    bbox = font_word.getbbox("A")
    ch_h = bbox[3] - bbox[1]

    # align ORP letter to horizontal center
    orp_offset = sum(widths[:orp]) + widths[orp] / 2
    x = W / 2 - orp_offset
    y = H / 2 - ch_h / 2 - 8

    # ORP marker lines (subtle)
    cx = W // 2
    d.line([(cx, H // 2 - 72), (cx, H // 2 - 55)], fill=(45, 45, 45), width=2)
    d.line([(cx, H // 2 + 52), (cx, H // 2 + 69)], fill=(45, 45, 45), width=2)

    # draw characters
    for i, (ch, cw) in enumerate(zip(chars, widths)):
        color = lerp_color(ACC, alpha) if i == orp else lerp_color(FG, alpha)
        d.text((x, y), ch, font=font_word, fill=color)
        x += cw

    # progress bar
    bx1, bx2 = 90, W - 90
    by = H - 30
    d.rectangle([(bx1, by), (bx2, by + 3)], fill=(28, 28, 28))
    fill_x = bx1 + int((bx2 - bx1) * word_i / total_words)
    if fill_x > bx1:
        d.rectangle([(bx1, by), (fill_x, by + 3)], fill=(75, 75, 75))

    # WPM counter (top right, dim)
    wpm_text = f"{WPM} wpm"
    d.text((W - 90 - int(d.textlength(wpm_text, font=font_wpm)), 28),
           wpm_text, font=font_wpm, fill=(55, 55, 55))

    return img

for wi, word in enumerate(SENTENCE):
    for f in range(WORD_FRAMES):
        emit(render_word(word, f / WORD_FRAMES, wi, len(SENTENCE)))

# ── Hold black (1s) ──────────────────────────────────────────────────────────
for _ in range(FPS):
    emit(blank())

total_s = frame_n / FPS
print(f"Done: {frame_n} frames  ({total_s:.1f}s)")
print()
print("Next step:")
print(f"  ffmpeg -framerate 30 -i frames_rsvp/frame_%04d.png -c:v libx264 -pix_fmt yuv420p rsvp.mp4")
