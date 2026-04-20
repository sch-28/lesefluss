# Publishing Roadmap

Publishing, Play Store, and monetisation phases. For feature roadmap see `../AGENTS.md`.

## Phase 1 - Finish the App
> Blocking for Play Store launch

- [x] In-app RSVP reader (ORP focal letter, punctuation delays, acceleration ramp, toggle from scroll reader)
- [x] Double-tap word → magnify icon to auto-search in dictionary modal
- [x] Search, clicking result doesnt highlight the location
- [x] Search modal doesnt let scroll to the bottom (it automatically scrolls up a bit again)

## Phase 2 - Polish & ESP32
> Nice to have before launch, not strictly blocking

### Reader enhancements
- [x] Highlights & annotations (select text, highlight, add notes, per-book storage)
- [x] Font family selection (serif / sans-serif at minimum) - Adjustable line spacing & margins - font size all in one option menu in reader
- [x] Sepia reading theme (third option alongside dark/light)
- [x] Library sorting & filtering (by title, author, recent, progress)
- [x] Estimated reading time remaining (per book / per chapter). For rsvp mode too

### ESP32
<!-- - [ ] Rotary encoder support (POTENTIOMETER_PLAN.md) - needed if selling with encoder -->
- [ ] Fix special characters (äüö and other characters e.g. << >>) in ESP32 reader
- [ ] Split long words on ESP32
- [ ] Verify WPM accuracy (check if display delay affects timing)
- [ ] Battery indicator in app (GPIO 4 voltage divider already on AMOLED board)
- [ ] Recompile AMOLED firmware with larger NimBLE buffers (BLE transfer window_size capped at 2 - ST7789 handles 4; fork nspsck/RM67162_Micropython_QSPI, increase NimBLE buffer config)

## Phase 3 - Publishing Infrastructure
> Everything needed to actually publish

- [x] Play Store listing - screenshots, description, privacy policy
- [ ] Play Store publish, 12 testers needed
- [x] better auth email verification
- [x] rsvp word position offset
- [x] GitHub Actions CI - push tag → build signed APK → publish as GitHub release
- [x] Web app: show a notice when using /app without being logged in that books are stored locally in the browser only and will be lost if browser data is cleared (check the full flow)
- [x] Website - live at `lesefluss.app`, pitch, live RSVP preview, embedded web app at `/app`, DIY vs assembled options, deployed via Coolify
- [x] Open source the monorepo on GitHub (AGPL v3)
- [x] DIY guide page on website - parts list with purchase links, flash + upload instructions, links to case STL files in repo
- [x] Case STL files committed to repo (e.g. `resources/case/`), linked from the DIY guide
- [x] Optional donation button (Ko-fi) on website

## Phase 4 - Accounts & Monetisation
> Website ↔ app integration, optional accounts, purchase management

- [x] Backend + auth - user accounts (Better Auth, email+password)
- [x] App account sync - sign in on website, same account active in app
- [x] Cloud sync for library and reading position (account-gated)
- [x] Web app embed - capacitor SPA served at `/app` on website with cookie auth

## Phase 5 - Post-launch
- [ ] iOS build (Capacitor makes this mostly a build target)
- [ ] Partial book sync (reduce long upload times for large books)
- [ ] OTA firmware update from app
- [ ] Minify / merge MicroPython files for faster uploads
- [ ] Reading statistics (account-gated, synced)
- [ ] Contact form for assembled unit requests (no Tindie / payment integration yet - gauge demand first)
