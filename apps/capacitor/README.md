# RSVP Companion App

Mobile companion app for the ESP32 RSVP Reader hardware device.

## Purpose

Enhance the ESP32 RSVP reader with mobile book management, settings sync, and a software RSVP reading mode for devices without the hardware reader.

## Core Features

**Device Integration**
- BLE/WiFi connection to ESP32 reader
- Sync reading settings (WPM, delays, acceleration, focal offset, inverse mode, word offset)
- Upload books to device (4 slots with position tracking)
- Monitor reading progress across slots

**Book Management**
- Import books (EPUB, TXT, PDF)
- Organize library with collections/tags
- Search and filter books
- Cloud backup and sync (optional)

**Mobile RSVP Reader**
- Software implementation of ESP32 reader features
- Focal letter highlighting with ORP (Optimal Recognition Point)
- Punctuation-aware delays
- Acceleration/ease-in on start/resume
- Position saving and word offset
- Configurable display (focal offset, inverse mode)
- Full settings parity with hardware device

**Settings Management**
- Configure all ESP32 settings via mobile UI
- Presets for different reading scenarios (speed reading, comfortable pace, etc.)
- Sync settings bidirectionally with device

## Development

Created with [`@capacitor/create-app`](https://github.com/ionic-team/create-capacitor-app).

```bash
pnpm install

# Development with hot reload (auto-opens browser at http://localhost:3000)
pnpm dev

# Alternative development command
pnpm start

# Type checking
pnpm check

# Production build
pnpm build

# Preview production build
pnpm preview
```

**Hot Reload:**
- Vite dev server runs on `http://localhost:3000`
- Automatically opens in browser
- Changes to `.tsx` files instantly reflect in browser
- Fast HMR (Hot Module Replacement)

## Current Features

**Database** ✅
- SQLite storage with `@capacitor-community/sqlite`
- Schemas: devices, settings, books
- Settings persistence with defaults
- Device connection history
- Book library ready for Phase 2

**Settings Page** ✅
- Complete UI for all ESP32 RSVP settings
- Interactive sliders for WPM, delays, acceleration, offsets
- Toggle switches for inverse colors and BLE
- Book slot selector
- Sync to/from device buttons (BLE integration pending)

## Roadmap

Phase 1 (MVP):
- [x] Settings UI matching ESP32 options
- [x] BLE connection to ESP32 
- [ ] Bidirectional settings sync

Phase 2 (Device Integration):
- [ ] Book import (TXT, EPUB convert to TXT)
- [ ] Local book library
- [ ] Upload books to device
- [ ] Reading progress monitoring

Phase 3 (Enhanced):
- [ ] Cloud sync
- [ ] Book reader (normal and rsvp)
- [ ] Settings preview using the rsvp app reader
- [ ] Web app version
- [ ] Advanced book management
- [ ] Reading statistics

