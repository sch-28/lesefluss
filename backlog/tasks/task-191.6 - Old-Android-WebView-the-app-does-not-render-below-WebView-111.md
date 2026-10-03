---
id: TASK-191.6
title: 'Old Android WebView: the app does not render below WebView 111'
status: Done
assignee: []
created_date: '2026-10-03 16:00'
updated_date: '2026-10-03 22:07'
labels:
  - android
  - ereader
  - compatibility
dependencies: []
documentation:
  - apps/capacitor/src/index.html
  - apps/capacitor/vite.config.ts
  - apps/capacitor/src/services/telemetry/index.ts
modified_files:
  - packages/core/src/engine-support.ts
  - packages/core/src/__tests__/engine-support.test.ts
  - packages/core/package.json
  - pnpm-lock.yaml
  - packages/book-import/src/utils/stream-async-iterator.ts
  - packages/book-import/src/utils/__tests__/stream-async-iterator.test.ts
  - packages/book-import/src/parsers/pdf.ts
  - apps/capacitor/vite.config.ts
  - apps/capacitor/src/index.html
  - apps/capacitor/src/main.tsx
  - apps/capacitor/e2e/old-webview-notice.spec.ts
  - apps/web/src/components/old-browser-notice.tsx
  - apps/web/src/components/__tests__/old-browser-notice.test.tsx
  - apps/web/src/routes/login/index.tsx
  - apps/web/src/routes/docs/-sections/troubleshooting.tsx
  - README.md
parent_task_id: TASK-191
priority: high
ordinal: 146000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The goal of TASK-191 is that Lesefluss runs on every kind of e-reader, including cheap ones. The app's CSS is Tailwind v4, which needs a Chromium 111+ engine (cascade layers, oklch, color-mix, @property), and the JS bundle targets roughly the same. minSdk is 24, so the app installs on Android 7+ devices whose System WebView can be far older. Cheap e-readers (older Boox, Likebook, Meebook, PocketBook Android models) often ship WebView 70-100 and have no Play Store to update it. On those the app shows an unstyled or blank screen with no explanation.

Evidence so far: the Boox Nova Air 2 probed on 2026-10-03 has WebView 149 (Play Store present), so it is fine; it says nothing about low-end devices. Settings > Diagnostics already shows the WebView version and `services/telemetry` computes it, but telemetry does not send it yet (see TASK-191.4), so the share of affected installs is unknown.

Two parts, in this order:
1. Never fail silently. At boot, before the app's CSS and bundle matter, detect an engine that is too old (plain inline script and inline styles in `index.html`, no framework) and show a readable page: which WebView version was found, that 111 or newer is needed, and how to update "Android System WebView" (Play Store link, and a note for devices without Play Store). This must itself work on very old WebViews.
2. Decide whether to lower the floor. Evaluate a down-levelled build (Lightning CSS targets for colour and nesting fallbacks, a cascade-layers polyfill or flattened layers, a lower JS target) against the oldest WebView worth supporting, and what it costs in bundle size and maintenance. Record the decision; implement only if it is cheap enough.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 On a WebView older than the supported floor the app shows a readable, self-contained notice naming the found and the required version and how to update, instead of a blank or unstyled screen
- [x] #2 The notice works without the app's CSS framework or module scripts and is covered by a test that simulates an old engine
- [x] #3 On supported WebViews nothing changes
- [x] #4 A written decision exists on lowering the floor (which version, what it costs), with numbers from a real build; if adopted, the app renders correctly on that version
- [x] #5 The supported WebView floor is documented where contributors and users can find it
- [x] #6 Optional, folded in from TASK-191.5: if the engine check from part 1 can be reused at no real cost, /login and /auth/mobile-callback on the website show the same plain, framer-free notice in a too-old browser (pointing to in-app code/QR sign-in); otherwise record why it was skipped
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
TASK-191.5 (website 'browser too old' notice) folded in here as an optional AC and archived: the Boox NeoBrowser (Chromium 111) is supported by the site, and since TASK-191.1/191.2 e-reader sign-in no longer needs the device browser, so it is only worth doing if the check from part 1 is reusable.

Part 1 (never fail silently):
- `packages/core/src/engine-support.ts`: MIN_CHROMIUM = 111 and `engineCheckScript()`, an ES5 inline script (unit test parses it with acorn ecmaVersion 5). Feature-detects `CSS.supports` for oklch() and color-mix(), not the UA; on failure adds `engine-unsupported` to <html>, fills `[data-engine-version]` with the UA's Chrome version and posts one `webview_unsupported` telemetry event (XHR, needs no server change).
- App: a Vite plugin (`engineCheck` in vite.config.ts) prepends the script to <head> and fills %MIN_CHROMIUM% in index.html; index.html carries a self-contained, inline-styled notice (version found, 111+ needed, Play Store link, no-Play-Store note, docs link) and unlayered rules that show it and hide #root; main.tsx skips bootstrap when the class is set.
- Website (AC #6, folded in from TASK-191.5): /login and /auth/mobile-callback add the same script via head().scripts and render `OldBrowserNotice` (server-rendered, hidden by default, points to in-app phone/QR or email sign-in). The form stays visible.
- Docs: troubleshooting entry on lesefluss.app/docs?tab=troubleshooting; README states the floor and where it is defined.

Verified on real engines (Chromium Linux snapshots, real-time load over CDP; 70 and 80 via headless screenshot because Playwright cannot attach to them):
| Chromium | 70 | 80 | 90 | 100 | 105 | 108 | 110 | 111 |
|---|---|---|---|---|---|---|---|---|
| current build | notice | notice | notice | notice | notice | notice | notice | app renders |
On 70 and 80 the bundle itself fails with a SyntaxError; the inline notice still renders. Boox (WebView 149): no notice, library renders. Engines 99-110 still apply the layered Tailwind reset, so every notice element is styled inline (checked on 100).

Part 2 decision: keep the floor at 111, do not ship a down-levelled build now.
Experiment (scratch build, engine check off, `build.cssMinify: lightningcss` + `cssTarget`/`target` lowered):
- chrome99 target: JS runs on 90-111 (no syntax/API errors), but 90 is unstyled (no @layer before 99) and 100/105 lose the full-height layout: `100dvh` (2 uses) needs 108 and Lightning CSS does not lower it.
- The stylesheet also uses `:has()` 32x and `@container` 6x (both 105) and individual `translate`/`scale`/`rotate` properties 30x (104), none of which Lightning CSS lowers.
- So config only reaches 108 (+3 versions); with a vh fallback for the two dvh uses 105 (+6 versions); below 105 needs rewriting :has()/container queries. CSS size at chrome105 vs chrome111, both minified: 141.7 KB vs 139.9 KB (+1.3%).
- The gain is too small for the change in every user's CSS output (full re-verification of modern rendering), and devices without Play Store tend to sit far below 105. Revisit when `webview_unsupported` / `webview_version` telemetry shows real installs in 105-110: then the cheap step is Lightning CSS targets + a 100vh fallback, floor 105.

Verification: core vitest 166, capacitor 1030, web 88 (+174 DB-integration skipped); tsc clean in all three; biome clean on changed files; full capacitor e2e 137 passed (incl. new old-webview-notice.spec.ts: simulated pre-111 engine shows the notice, #root stays empty, one telemetry POST; supported engine never sees it).

Review pass (5 agents) and fixes:
- Splash screen covered the notice for its full 8 s timeout on every launch (only the root route hid it). The script now hides it through `Capacitor.nativePromise("SplashScreen", "hide")` on window load and after 1 s; a hide at DOMContentLoaded had no effect on the Boox. Verified on device with a build whose check was forced to fail: notice visible within 4 s; the Play Store link opens the Play Store.
- The notice could not scroll (app CSS sets html/body overflow:hidden unlayered); the unsupported rule now restores height/overflow.
- WEB_BUILD (lesefluss.app/app) got the Android notice and platform android: the notice now has android and web sections, picked by %ENGINE_PLATFORM%; telemetry stays off there (VITE_SYNC_URL empty in the Docker build).
- Script moved from head-prepend to right after <meta charset> (the charset sat at byte 954 of the 1024 browsers scan).
- Detection also requires `CSS.registerProperty` (@property): Firefox 113-127 and Safari 16.2-16.3 passed the colour checks but lack it. No change for Chromium (78+).
- Version fill also runs when the script executes after DOMContentLoaded (TanStack injects route head scripts on client navigation); class is no longer appended twice.
- Website: notice text no longer shows a Chromium version (was 'unknown' on Firefox/Safari, and the filled-in text caused a React hydration mismatch that client-rendered the login page); now points to a current Chrome/Firefox/Safari or the app's phone/email sign-in. Removed from /auth/mobile-callback, which only renders for signed-in users and whose link works without JS.
- Docs entry: no longer points to Settings > Diagnostics (unreachable when the app does not start); uses MIN_CHROMIUM.
- Floor audit: 111 holds for start, library, reader, EPUB, charts. PDF import broke below Chromium 124 (pdf.js legacy build iterates ReadableStream with for await, not polyfilled); `ensureReadableStreamAsyncIterator()` now runs before pdf.js loads (packages/book-import/src/utils/stream-async-iterator.ts, unit-tested; the reviewer verified the same polyfill makes text extraction work on Chromium 111).
- e2e no longer depends on a local .env (telemetry asserted only if the build carries the URL), asserts the web database never starts (fails if the main.tsx guard is removed; checked), and that supported engines post nothing.

Final verification after review fixes: core vitest 169, book-import 111 (+1 skipped), capacitor 1030, web 88 (+174 DB-integration skipped); tsc clean in all four; biome clean on every changed file; full capacitor e2e 137 passed; re-probe: Chromium 111 runs the app, 110 and 100 show the notice; Boox normal build unchanged.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Apps and website no longer fail silently on engines too old for Tailwind v4.

- Shared ES5 engine check (`packages/core/src/engine-support.ts`, MIN_CHROMIUM = 111): feature-detects oklch(), color-mix() and @property, marks <html>, fills the version found, reports `webview_unsupported` telemetry (app only) and hides the splash screen.
- Android app: self-contained notice in index.html (version found, 111+ needed, Play Store link, no-Play-Store note, docs link); the app does not boot behind it. The web build at lesefluss.app/app gets browser wording instead.
- Website /login: inline notice above the form pointing to a current browser or the app's phone/email sign-in (folded in from TASK-191.5).
- PDF import fixed for Chromium 111-123 (ReadableStream async-iteration fallback before pdf.js loads).
- Docs troubleshooting entry and README state the floor.
- Decision: floor stays 111. A down-levelled build reaches only 108 by config (105 with two dvh fallbacks); revisit when telemetry shows installs in 105-110.

Verified on real Chromium 70-111 snapshots and on the Boox (forced-fail build and normal build). Tests: core, book-import, capacitor, web unit suites, full capacitor e2e (137) green.
<!-- SECTION:FINAL_SUMMARY:END -->
