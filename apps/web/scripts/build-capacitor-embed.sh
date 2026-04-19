#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_DIR="$(dirname "$SCRIPT_DIR")"
CAP_DIR="$WEB_DIR/../capacitor"

echo "Building capacitor app for web embed..."
cd "$CAP_DIR"
WEB_BUILD=1 VITE_SYNC_URL="" VITE_WEB_BUILD=true VITE_CATALOG_URL="${CATALOG_URL:-https://catalog.lesefluss.app}" pnpm build

echo "Copying build output to public/app/..."
rm -rf "$WEB_DIR/public/app"
cp -r "$CAP_DIR/dist" "$WEB_DIR/public/app"

echo "Injecting noindex meta into SPA index.html..."
INDEX="$WEB_DIR/public/app/index.html"
if ! grep -q 'name="robots"' "$INDEX"; then
  sed -i 's|<head>|<head>\n    <meta name="robots" content="noindex, nofollow" />|' "$INDEX"
fi

echo "Done - capacitor web build available at public/app/"
