#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_DIR="$(dirname "$SCRIPT_DIR")"
CAP_DIR="$WEB_DIR/../capacitor"

echo "Building capacitor app for web embed..."
cd "$CAP_DIR"
WEB_BUILD=1 VITE_SYNC_URL="" VITE_WEB_BUILD=true pnpm build

echo "Copying build output to public/app/..."
rm -rf "$WEB_DIR/public/app"
cp -r "$CAP_DIR/dist" "$WEB_DIR/public/app"

echo "Done — capacitor web build available at public/app/"
