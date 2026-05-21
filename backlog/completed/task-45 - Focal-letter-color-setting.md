---
id: TASK-45
title: Focal letter color setting
status: Done
assignee:
  - OpenCode
created_date: '2026-04-26 15:59'
updated_date: '2026-05-01 15:36'
labels: []
milestone: m-5
dependencies: []
ordinal: 5000
---

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Implement `focalLetterColor` as a synced app + ESP32 setting stored as a hex color string, while the UI exposes curated preset swatches.

1. Shared settings: add a focal-letter color default and hex validation helper/regex in `packages/core/src/settings.ts`, include `focalLetterColor` in `SYNCED_SETTING_KEYS`, and map it to ESP32 wire key `focal_letter_color` in `ESP32_SETTING_KEYS`.
2. Sync schema: add `focalLetterColor` to `SyncSettingsSchema` as a strict `#rrggbb` string so cloud sync validates and transports future-proof color values.
3. Local persistence: add `focal_letter_color TEXT NOT NULL DEFAULT '#ff0000'` to Capacitor settings schema, defaults query, and new SQLite migration + journal entry.
4. Cloud persistence: add `focal_letter_color TEXT NOT NULL DEFAULT '#ff0000'` to web sync settings schema and new Postgres migration + journal entry with a hex-format check constraint.
5. Capacitor UI/rendering: add preset swatches to `RsvpSettingsForm` that write hex values, pass the value into `RsvpPreview`, and apply the selected color to `RsvpPreview` and `RsvpView` through a CSS variable instead of hardcoded red.
6. ESP32: add the hex setting default and a small `#rrggbb` parser in `config.py`, load/persist override in `main.py` and `handler_settings.py`, round-trip it over BLE, and use the parsed RGB tuple in `DisplayManager.show_word()`.
7. Documentation/verification: update shared settings docs in `AGENTS.md`, then run Biome/type/Python checks and fix issues within scope.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review fixes applied: added `focalLetterColor` to the shared `RsvpSettings` type and reader settings construction so the Capacitor RSVP reader receives the value; normalized ESP32 BLE input with `normalize_hex_color()` before persisting invalid client strings. Verified the app path uses `--rsvp-focal-color` in `RsvpView`, and ESP32 `DisplayManager.show_word()` parses `FOCAL_LETTER_COLOR` via `hex_to_rgb()`.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented focal letter color as a synced hex setting (`#rrggbb`) with preset swatches in the RSVP settings UI.

Summary:
- Added shared default, preset values, sync validation, BLE mapping, local SQLite migration, and web Postgres migration for `focalLetterColor` / `focal_letter_color`.
- Wired Capacitor RSVP settings, preview, and actual in-app RSVP reader rendering to use the selected color via `--rsvp-focal-color`.
- Wired ESP32 firmware to read/write/persist the hex setting over BLE, validate/normalize incoming values, and convert the selected color to RGB for focal glyph rendering.
- Updated `AGENTS.md` shared settings documentation.

Verification:
- `pnpm exec biome check ...` on touched TypeScript files passed.
- `pnpm check-python` passed.
- `pnpm exec turbo run check-types` passed, including Capacitor Vitest suite (164 tests).
<!-- SECTION:FINAL_SUMMARY:END -->
