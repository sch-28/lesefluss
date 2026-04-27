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
- [ ] Font app size
- [x] Improve sepia theme
- [x] Onboarding
- [x] RSVP controls, context, dict, scroll
- [x] Extended onboarding with sample book or more
- [x] Hide toggle for selected word

## Phase 4 - Accounts & Monetisation
> Website ↔ app integration, optional accounts, purchase management

- [x] Backend + auth - user accounts (Better Auth, email+password)
- [x] App account sync - sign in on website, same account active in app
- [x] Cloud sync for library and reading position (account-gated)
- [x] Web app embed - capacitor SPA served at `/app` on website with cookie auth

## Phase 5 - Content Ingestion
> Getting text into the app from anywhere

- [x] PDF support (text extraction, metadata, cover, chapters from bookmarks)
- [x] Paste text (quick-import from clipboard)
- [x] Paste URL → readability extraction → import as book (via catalog proxy for CORS)
- [x] Android share intent → share any webpage or text to Lesefluss
- [x] HTML file import (via file picker; same Readability pipeline as URL)
- [ ] Calibre library import (multi-book source; needs `AsyncIterable<Book>` API)
- [ ] Web novel scraping (Royal Road, ScribbleHub — see `apps/capacitor/BOOK_IMPORT.md` for strategy notes)
- [ ] Kindle `My Clippings.txt` → highlights table (routed outside book-import)
- [ ] iOS share extension (Android done; iOS needs its own Xcode target)
- [ ] Loading indicator for import (when share from browser) and loading indicator when sync is running

## Phase 6 - Reading Experience v2
> Quality-of-life on top of what already works

- [ ] Split long words on ESP32 and capactitor reader
- [ ] Export highlights (Markdown / CSV / Readwise-compatible)
- [ ] Reader bookmarks (separate from highlights - "return to" markers)
- [ ] Keyboard shortcuts for web reader (space, arrows, etc.)
- [ ] Focal letter color setting
- [ ] Reading statistics page (local-first; aggregates across devices automatically when logged in via existing sync)
- [ ] Reader "ink page" mode (paginated, e-ink-style page turn instead of scroll)
- [ ] Per-chapter / local progress display (show chapter progress instead of whole-book — feels more rewarding)
- [ ] Quick-read button ("Finish this chapter in 3 min" — auto-tunes WPM to time budget)
- [ ] Auto-open last book on app launch (toggle in settings)
- [ ] Full-screen reading mode (hide chrome; ease into it gradually as the user keeps reading)
- [ ] Do-Not-Disturb mode while reading (silence notifications via Capacitor APIs)
- [ ] Music integration — attach a playlist (Spotify / Apple Music) to a book, auto-play on open
- [ ] Name / character tracker — auto-extracted list of characters per book, tap for first appearance
- [ ] Current-scene character panel — show who's "on stage" in the current scene to aid visualization
- [ ] AI-assisted on-ramp — short summary / "where you left off" recap to lower the barrier to picking a book back up
- [ ] Plugin architecture — expose reader/import/sync extension points so features like AI summaries, trackers, music can ship as optional modules
- [ ] Full-text search across library (SQLite FTS5)

## Phase 7 - Social & Discovery
- [ ] Suggestion form on website for user feedback and suggestions
- [ ] Public profiles (opt-in; private by default, friends only, or public) - show books read, currently reading, progress, covers resolved from catalog where possible
- [ ] Share highlights and notes (short quoted snippets - §51 UrhG quotation right)
- [ ] Share public-domain books from catalog (Gutenberg / Standard Ebooks only - no user-uploaded files)
- [ ] Friends / follow (see what friends are reading, their highlights, progress)
- [ ] Buddy reading (sync progress with a friend on the same book, compare position, react to each other's highlights)
- [ ] Multiplayer reading sessions / races (live shared session, position leaderboard, finish-line ping)
- [ ] Comments on books and chapters (per-book or per-chapter discussion threads)
- [ ] Explore/discovery: short reads filter on catalog (quick reads genre)
- [ ] Curated article sources on Explore (Longreads, Aeon, PG essays — feeds → one-tap import via existing URL proxy)
- [ ] Import reading history from Goodreads CSV (populate profile stats; auto-match to-read list against catalog for one-click imports of public-domain hits)
- [ ] Open Library as additional catalog metadata source (better covers, author data, ISBN matching)

> No full-book sharing of user-uploaded files - copyright exposure. Platform stays in personal-cloud-locker territory.

## Phase 8 - ESP32 v2
- [ ] OTA firmware update from app
- [ ] Partial book sync (reduce long upload times for large books)
- [ ] Minify / merge MicroPython files for faster uploads
- [ ] WLAN transfer spike (viability check vs. BLE / partial sync)
- [ ] Touchscreen hardware exploration (Waveshare OLED with touch, gesture controls, SD-card USB transfer) - gate on demand signals
- [ ] Contact form for assembled unit requests (gauge demand before Tindie / payment integration)
- [ ] Fix special characters (äüö and other characters e.g. << >>) in ESP32 reader
- [ ] Verify WPM accuracy (check if display delay affects timing)
- [ ] Battery indicator in app (GPIO 4 voltage divider already on AMOLED board)
- [ ] Recompile AMOLED firmware with larger NimBLE buffers (BLE transfer window_size capped at 2 - ST7789 handles 4; fork nspsck/RM67162_Micropython_QSPI, increase NimBLE buffer config)
- [ ] Check BLE radio state before scanning (prompt user / surface error if Bluetooth is off, instead of silent no-results)
- [ ] Browser-based ESP32 flasher on website (Web Serial / esptool-js, RSVP Neo style — flash firmware from Chrome without local toolchain)

## Phase 9 - Platform Reach
- [ ] iOS build (Capacitor makes this mostly a build target)
- [ ] PWA / offline for `/app` (service worker + persistent SQLite - fixes "cleared browser data" loss)

## Later / Low Priority
- [ ] TTS
- [ ] Browser extension (Firefox + Chrome, shared codebase) - send current page to Lesefluss web
- [ ] German locale

## Known Bugs / Fixes
- [x] "Delete book" only deletes locally? or atleast the book gets restored when opening on web bc the book is in db there maybe?
- [x] Admin: deleting a book while the user filter is active crashes the entire website
- [x] Onboarding settings page doesnt  scroll (content cut off / can't reach bottom)
- [x] App login issue on older web views
