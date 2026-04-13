# Publishing Roadmap

## Phase 1 — Finish the App
> Blocking for Play Store launch

- [x] In-app RSVP reader (ORP focal letter, punctuation delays, acceleration ramp, toggle from scroll reader)
- [x] Double-tap word → magnify icon to auto-search in dictionary modal
- [x] Search, clicking result doesnt highlight the location
- [x] Search modal doesnt let scroll to the bottom (it automatically scrolls up a bit again)

## Phase 2 — Polish & ESP32
> Nice to have before launch, not strictly blocking

<!-- - [ ] Rotary encoder support (POTENTIOMETER_PLAN.md) — needed if selling with encoder -->
- [ ] Fix special characters (äüö and other characters e.g. << >>) in ESP32 reader
- [ ] Split long words on ESP32
- [ ] Verify WPM accuracy (check if display delay affects timing)
- [ ] Battery indicator in app (GPIO 4 voltage divider already on AMOLED board)
- [ ] Recompile AMOLED firmware with larger NimBLE buffers (BLE transfer window_size capped at 2 — ST7789 handles 4; fork nspsck/RM67162_Micropython_QSPI, increase NimBLE buffer config)

## Phase 3 — Publishing Infrastructure
> Everything needed to actually sell

- [ ] Play Store listing — screenshots, description, privacy policy
- [ ] Website — pitch, screenshots, "Getting books" section (Project Gutenberg, Standard Ebooks), DIY vs assembled options, account/order management
- [ ] DIY guide (5€) — exact parts list with purchase links, flash + upload instructions, case print files; sold via website
- [ ] Case STL files published on Printables / Thingiverse, linked from website and DIY guide
- [ ] Order flow for assembled units — Tindie listing or contact form to start (50–70€, AMOLED variant)

## Phase 4 — Accounts & Monetisation
> Website ↔ app integration, optional accounts, purchase management

- [ ] Backend + auth — user accounts (optional, not required to use the app)
- [ ] Website payment integration — handle DIY guide purchases and assembled unit orders
- [ ] License system — purchases on website unlock content/features in the app (e.g. DIY guide download, future premium features)
- [ ] App account sync — sign in on website, same account active in app; purchases and entitlements reflected in both
- [ ] Cloud sync for library and reading position (account-gated)

## Phase 5 — Post-launch
- [ ] iOS build (Capacitor makes this mostly a build target)
- [ ] Partial book sync (reduce long upload times for large books)
- [ ] OTA firmware update from app
- [ ] Minify / merge MicroPython files for faster uploads
- [ ] Reading statistics (account-gated, synced)
