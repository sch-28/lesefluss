#!/usr/bin/env python3
"""
Generate Lesefluss boot sequence frames for Blender texture.
Output resolution: 1072×500 (matches screen mesh aspect ratio)

Usage:
    pip install Pillow
    python gen_boot.py
    ffmpeg -framerate 30 -i frames_boot/frame_%04d.png -c:v libx264 -pix_fmt yuv420p boot.mp4

In Blender: Image Texture node → open boot.mp4 → set to "Movie" → enable "Auto Refresh"
"""

from PIL import Image, ImageDraw, ImageFont
import os

# ── Config ────────────────────────────────────────────────────────────────────
W, H   = 1072, 500
FPS    = 30
BG     = (0, 0, 0)
FG     = (235, 235, 235)
ACC    = (255, 165, 0)    # ORP highlight (amber)
GREEN  = (80,  200, 80)   # [OK] color
DIMMED = (90,  90,  90)

FONT = "/usr/share/fonts/TTF/DejaVuSansMono.ttf"
FONT_BOLD = "/usr/share/fonts/TTF/DejaVuSansMono-Bold.ttf"

font_title = ImageFont.truetype(FONT_BOLD, 42)
font_body  = ImageFont.truetype(FONT, 26)

os.makedirs("frames_boot", exist_ok=True)
frame_n = 0

# ── Helpers ───────────────────────────────────────────────────────────────────
def emit(img):
    global frame_n
    img.save(f"frames_boot/frame_{frame_n:04d}.png")
    frame_n += 1

def blank():
    return Image.new("RGB", (W, H), BG)

def lerp_color(c, alpha):
    return tuple(int(v * alpha) for v in c)

# ── Phase 0: Pixel progress bar (3s) ─────────────────────────────────────────
PX_TOTAL   = 3
PX_FRAMES  = int(PX_TOTAL * FPS)
PX_BLOCKS  = 20
PX_BW      = 10
PX_BH      = 6
PX_GAP     = 3
PX_BAR_W   = PX_BLOCKS * (PX_BW + PX_GAP) - PX_GAP

def render_pixel_bar(t):
    img = blank()
    d = ImageDraw.Draw(img)

    progress = min(1.0, t / (PX_TOTAL * 0.85))
    filled = int(PX_BLOCKS * progress)

    bx = (W - PX_BAR_W) // 2
    by = H // 2 - PX_BH // 2

    for i in range(PX_BLOCKS):
        x = bx + i * (PX_BW + PX_GAP)
        if i < filled:
            d.rectangle([(x, by), (x + PX_BW - 1, by + PX_BH - 1)], fill=ACC)
        else:
            d.rectangle([(x, by), (x + PX_BW - 1, by + PX_BH - 1)], fill=(25, 25, 25))

    return img

for f in range(PX_FRAMES):
    emit(render_pixel_bar(f / FPS))

# brief black gap before boot text
for _ in range(int(0.3 * FPS)):
    emit(blank())

# ── Phase 1: Boot sequence (4.5s) ────────────────────────────────────────────
BOOT_EVENTS = [
    (0.3,  "title", "Lesefluss"),
    (0.9,  "dots",  "Booting"),
    (1.5,  "ok",    "Loading book.txt"),
    (2.1,  "ok",    "Calibrating display"),
    (2.9,  "gap",   ""),
    (3.1,  "title", "Welcome."),
]

BOOT_TOTAL = 4.5
BOOT_FRAMES = int(BOOT_TOTAL * FPS)

def render_boot(t):
    img = blank()
    d = ImageDraw.Draw(img)

    y = 90
    LINE_H = 44

    for start, style, text in BOOT_EVENTS:
        if t < start:
            break
        age = t - start

        if style == "gap":
            y += LINE_H // 2
            continue

        elif style == "title":
            a = min(1.0, age / 0.4)
            shown = text[:max(1, int(len(text) * min(1.0, age / 0.35)))]
            cursor = "_" if len(shown) < len(text) else ""
            color = lerp_color(ACC, a)
            d.text((90, y), shown + cursor, font=font_title, fill=color)
            y += 60

        elif style == "dots":
            a = min(1.0, age / 0.3)
            shown = text[:max(1, int(len(text) * min(1.0, age / 0.25)))]
            typing_done = len(shown) >= len(text)
            dots = "." * (1 + int(age * 2.5) % 3) if typing_done else ""
            cursor = "_" if not typing_done else ""
            color = lerp_color(DIMMED, a)
            d.text((90, y), shown + dots + cursor, font=font_body, fill=color)
            y += LINE_H

        elif style == "ok":
            a = min(1.0, age / 0.25)
            shown = text[:max(1, int(len(text) * min(1.0, age / 0.2)))]
            typing_done = len(shown) >= len(text)
            ok = "  [OK]" if (typing_done and age > 0.35) else ""
            color_text = lerp_color(DIMMED, a)
            d.text((90, y), shown, font=font_body, fill=color_text)
            if ok:
                ok_x = 90 + int(d.textlength(shown, font=font_body))
                ok_a = min(1.0, (age - 0.35) / 0.15)
                d.text((ok_x, y), ok, font=font_body, fill=lerp_color(GREEN, ok_a))
            y += LINE_H

    return img

for f in range(BOOT_FRAMES):
    emit(render_boot(f / FPS))

# ── Hold black (1s) ──────────────────────────────────────────────────────────
for _ in range(FPS):
    emit(blank())

total_s = frame_n / FPS
print(f"Done: {frame_n} frames  ({total_s:.1f}s)")
print()
print("Next step:")
print(f"  ffmpeg -framerate 30 -i frames_boot/frame_%04d.png -c:v libx264 -pix_fmt yuv420p boot.mp4")
