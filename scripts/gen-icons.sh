#!/usr/bin/env bash
# Generate all app icons from resources/logo.png
# Requires: ImageMagick (magick)
#
# Outputs:
#   apps/web/public/          - favicon.ico, favicon*.png, apple-touch-icon.png, logo.png
#   apps/extension/public/    - icon-*.png, logo.png
#   apps/capacitor/android/   - mipmap-*/ic_launcher*.png, drawable-*/splash.png

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$REPO_ROOT/resources/logo.png"
# Cream disc color in source logo. Used to swap to black for dark-mode splash.
LIGHT_DISC="#FEF6E4"
DARK_DISC="#0c0d0e"
SRC_DARK="$REPO_ROOT/resources/.logo-dark.png"
WEB="$REPO_ROOT/apps/web/public"
EXT="$REPO_ROOT/apps/extension/public"
CAP="$REPO_ROOT/apps/capacitor/public"
ANDROID="$REPO_ROOT/apps/capacitor/android/app/src/main/res"

# Logo occupies this fraction of the icon/splash canvas (0.0 to 1.0)
ICON_LOGO_SCALE=0.50   # launcher icons - logo size relative to canvas (lower = more padding)
SPLASH_LOGO_SCALE=0.35 # splash screen (relative to shorter side)
ICON_BG="none"
SPLASH_BG="none"

if [ ! -f "$SRC" ]; then
  echo "Error: $SRC not found"
  exit 1
fi

if ! command -v magick &>/dev/null; then
  echo "Error: ImageMagick not found - install with: sudo apt install imagemagick"
  exit 1
fi

# Compose logo onto a solid square canvas with padding
# Usage: icon_compose <canvas_px> <output_path> [scale]
icon_compose() {
  local size=$1 out=$2 scale=${3:-$ICON_LOGO_SCALE}
  local logo_px
  logo_px=$(echo "$size $scale" | awk '{printf "%d", $1 * $2}')
  magick -size "${size}x${size}" "xc:${ICON_BG}" \
    \( "$SRC" -resize "${logo_px}x${logo_px}" \) \
    -gravity center -composite "$out"
}

# Compose logo onto a rectangular splash canvas
# Usage: splash_compose <width> <height> <output_path> [source_logo]
splash_compose() {
  local w=$1 h=$2 out=$3 src=${4:-$SRC}
  local shorter
  shorter=$(( w < h ? w : h ))
  local logo_px
  logo_px=$(echo "$shorter $SPLASH_LOGO_SCALE" | awk '{printf "%d", $1 * $2}')
  magick -size "${w}x${h}" "xc:${SPLASH_BG}" \
    \( "$src" -resize "${logo_px}x${logo_px}" \) \
    -gravity center -composite "$out"
}

echo "Source: resources/logo.png"

# ── Web ────────────────────────────────────────────────────────────────────────
echo ""
echo "=== Web (apps/web/public/) ==="

cp "$SRC" "$WEB/logo.png"
echo "  logo.png (raw, for header)"

icon_compose 512 "$WEB/favicon.png" 1.0
echo "  favicon.png (512x512)"

cp "$WEB/favicon.png" "$WEB/logo-512.png"
echo "  logo-512.png"

cp "$WEB/favicon.png" "$WEB/android-chrome-512x512.png"
echo "  android-chrome-512x512.png"

icon_compose 16  "$WEB/favicon-16x16.png" 1.0
echo "  favicon-16x16.png"

icon_compose 32  "$WEB/favicon-32x32.png" 1.0
echo "  favicon-32x32.png"

icon_compose 48  "$WEB/favicon-48x48.png" 1.0
echo "  favicon-48x48.png"

icon_compose 180 "$WEB/apple-touch-icon.png" 1.0
echo "  apple-touch-icon.png (180x180)"

magick "$WEB/favicon-16x16.png" "$WEB/favicon-32x32.png" "$WEB/favicon-48x48.png" "$WEB/favicon.ico"
echo "  favicon.ico (16+32+48)"

# ── Browser extension ────────────────────────────────────────────────────────
echo ""
echo "=== Extension (apps/extension/public/) ==="

mkdir -p "$EXT"
cp "$SRC" "$EXT/logo.png"
echo "  logo.png"

for size in 16 32 48 96 128; do
  icon_compose "$size" "$EXT/icon-${size}.png" 1.0
  echo "  icon-${size}.png (${size}x${size})"
done

# ── Capacitor web ─────────────────────────────────────────────────────────────
echo ""
echo "=== Capacitor web (apps/capacitor/public/) ==="

cp "$SRC" "$CAP/logo.png"
echo "  logo.png"

icon_compose 512 "$CAP/favicon.png" 1.0
echo "  favicon.png (512x512)"

icon_compose 180 "$CAP/apple-touch-icon.png" 1.0
echo "  apple-touch-icon.png (180x180)"

# ── Android launcher icons ────────────────────────────────────────────────────
echo ""
echo "=== Android (mipmap launcher icons) ==="

declare -A SIZES=([mdpi]=48 [hdpi]=72 [xhdpi]=96 [xxhdpi]=144 [xxxhdpi]=192)
declare -A FG_SIZES=([mdpi]=108 [hdpi]=162 [xhdpi]=216 [xxhdpi]=324 [xxxhdpi]=432)

for density in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  size="${SIZES[$density]}"
  dir="$ANDROID/mipmap-$density"
  mkdir -p "$dir"
  icon_compose "$size" "$dir/ic_launcher.png"
  icon_compose "$size" "$dir/ic_launcher_round.png"
  echo "  $density: ${size}x${size} (ic_launcher + ic_launcher_round)"
done

echo ""
echo "=== Android (adaptive foreground, transparent bg) ==="

# Android safe zone = inner 72dp of 108dp canvas (66.7%).
# Logo at ICON_LOGO_SCALE relative to the safe zone, placed on transparent 108dp canvas.
# Formula: logo_px = canvas_px * (72/108) * ICON_LOGO_SCALE
for density in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  size="${FG_SIZES[$density]}"
  dir="$ANDROID/mipmap-$density"
  mkdir -p "$dir"
  logo_px=$(echo "$size $ICON_LOGO_SCALE" | awk '{printf "%d", $1 * (72/108) * $2}')
  magick -size "${size}x${size}" xc:none \
    \( "$SRC" -resize "${logo_px}x${logo_px}" \) \
    -gravity center -composite "$dir/ic_launcher_foreground.png"
  echo "  $density: ${size}x${size}, logo ${logo_px}px (ic_launcher_foreground)"
done

# ── Android splash screens ────────────────────────────────────────────────────
echo ""
echo "=== Android (splash screens) ==="

declare -A PORT_SIZES=([mdpi]="320x480" [hdpi]="480x800" [xhdpi]="720x1280" [xxhdpi]="960x1600" [xxxhdpi]="1280x1920")
declare -A LAND_SIZES=([mdpi]="480x320" [hdpi]="800x480" [xhdpi]="1280x720" [xxhdpi]="1600x960" [xxxhdpi]="1920x1280")

for density in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  IFS='x' read -r pw ph <<< "${PORT_SIZES[$density]}"
  mkdir -p "$ANDROID/drawable-port-${density}"
  splash_compose "$pw" "$ph" "$ANDROID/drawable-port-${density}/splash.png"
  echo "  port-$density: ${pw}x${ph}"

  IFS='x' read -r lw lh <<< "${LAND_SIZES[$density]}"
  mkdir -p "$ANDROID/drawable-land-${density}"
  splash_compose "$lw" "$lh" "$ANDROID/drawable-land-${density}/splash.png"
  echo "  land-$density: ${lw}x${lh}"
done

# default fallback splash
mkdir -p "$ANDROID/drawable"
splash_compose 480 320 "$ANDROID/drawable/splash.png"
echo "  drawable (fallback): 480x320"

# Generate dark logo by recoloring the cream disc to black. Orange ship stays
# untouched. Output goes to a hidden file (not tracked).
echo ""
echo "=== Building dark logo variant ==="
magick "$SRC" -fuzz 10% -fill "$DARK_DISC" -opaque "$LIGHT_DISC" "$SRC_DARK"
echo "  $SRC_DARK"

# Dark-mode splash variants. Android picks `drawable-night-*` automatically
# when the system is in dark mode.
if [ -f "$SRC_DARK" ]; then
  echo ""
  echo "=== Android (dark-mode adaptive icon foreground) ==="
  # Android 12+ Splash API uses the adaptive launcher icon as the splash icon,
  # so the dark logo must also live in mipmap-night-* for it to swap in dark mode.
  for density in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
    size="${FG_SIZES[$density]}"
    dir="$ANDROID/mipmap-night-$density"
    mkdir -p "$dir"
    logo_px=$(echo "$size $ICON_LOGO_SCALE" | awk '{printf "%d", $1 * (72/108) * $2}')
    magick -size "${size}x${size}" xc:none \
      \( "$SRC_DARK" -resize "${logo_px}x${logo_px}" \) \
      -gravity center -composite "$dir/ic_launcher_foreground.png"
    echo "  night-$density: ${size}x${size} (ic_launcher_foreground)"
  done

  echo ""
  echo "=== Android (dark-mode splash screens) ==="
  # Android qualifier order: orientation, night-mode, density.
  for density in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
    IFS='x' read -r pw ph <<< "${PORT_SIZES[$density]}"
    mkdir -p "$ANDROID/drawable-port-night-${density}"
    splash_compose "$pw" "$ph" "$ANDROID/drawable-port-night-${density}/splash.png" "$SRC_DARK"
    echo "  port-night-$density: ${pw}x${ph}"

    IFS='x' read -r lw lh <<< "${LAND_SIZES[$density]}"
    mkdir -p "$ANDROID/drawable-land-night-${density}"
    splash_compose "$lw" "$lh" "$ANDROID/drawable-land-night-${density}/splash.png" "$SRC_DARK"
    echo "  land-night-$density: ${lw}x${lh}"
  done
  mkdir -p "$ANDROID/drawable-night"
  splash_compose 480 320 "$ANDROID/drawable-night/splash.png" "$SRC_DARK"
  echo "  drawable-night (fallback): 480x320"
else
  echo ""
  echo "[skip] resources/logo-dark.png not found - dark splash uses light logo"
fi

echo ""
echo "Done."
