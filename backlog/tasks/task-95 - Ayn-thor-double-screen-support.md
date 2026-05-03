---
id: TASK-95
title: Ayn thor double screen support
status: In Progress
assignee: []
created_date: '2026-04-26 19:36'
updated_date: '2026-05-03 23:11'
labels: []
milestone: m-9
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Would be cool to utilize both screens
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Secondary WebView loads the existing <App />, not a bespoke SecondaryApp tree
- [ ] #2 ?screen=2 flag gates DatabaseProvider/BLE/Sync/ShareIntent providers (no native plugin calls on secondary)
- [ ] #3 SecondaryDatabaseProvider populates queryClient cache from bus snapshots so existing queryHooks return data without SQLite
- [ ] #4 Mutations on secondary (useSaveSettings, useImportBook etc.) route through bus commands to primary
- [ ] #5 Library page renders on screen 2 using the existing Library component — taps open the book on primary
- [ ] #6 Settings/RSVP page renders on screen 2 using the existing RsvpSettingsForm — slider changes propagate to primary and cloud/BLE sync
- [ ] #7 Theme change on either screen propagates to the other immediately
- [ ] #8 Bundle: non-Thor users still receive zero secondary-only code; main bundle unchanged
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Architecture pivot — read this first

The first implementation pass (on a separate branch) built a parallel UI tree under `src/secondary/` that consumes a custom bus push channel. **This is the wrong shape.** It duplicates components (settings form, library list, controls) and produces visual mismatches with the main app.

The right architecture is: **load the same `<App />` in the secondary WebView with a `?screen=2` flag**, and stub the data layer for the secondary so it reads from the bus instead of SQLite. The Library page, Settings page, RSVP form etc. then *literally* render the existing components — true reuse.

The secondary WebView has no Capacitor bridge (confirmed: `Capacitor.getPlatform()` returns `"web"` inside it), which is why the data layer needs stubbing. But everything above the data layer can be reused.

## Phase 1+2 (DONE) — keep on the new branch

Working on the Ayn Thor and verified end-to-end:

- **Native Presentation + WebView in `DualScreenPlugin.java`**: spawns a real Android WebView inside a `Presentation` on display 4. Uses `androidx.webkit.WebViewAssetLoader` with a custom `PathHandler` that maps `https://appassets.androidplatform.net/*` → `assets/public/*` (the Capacitor bundle). SPA fallback in `shouldInterceptRequest` serves `index.html` for unknown paths.
- **Bidirectional plugin event channel**:
  - Primary → Secondary: `DualScreen.pushState(snapshot)` → plugin → `evaluateJavascript("window.__DualScreen.__onState(...)")`
  - Secondary → Primary: `window.__DualScreenNative.command(json)` JavascriptInterface → `notifyListeners('command', data)` on the primary's Capacitor bridge
  - `markReady()` from secondary triggers replay of `lastPushed` so a navigation/reload doesn't lose state
- **Lifecycle**: `handleOnPause` dismisses, `handleOnResume` re-shows. Display 4 swap behavior (launch on bottom screen → top becomes the primary, leaves bottom free) preserved.
- **Phase 1/2/3 demo views work** — controls, cover, library, settings — but they're bespoke (the wrong shape — see pivot above).

## Phase 3 (PIVOT) — what to actually build next

Reorganize so the secondary loads the existing `<App />` and reuses every page:

### Code to keep
- `apps/capacitor/android/app/src/main/java/app/lesefluss/DualScreenPlugin.java` — entire native plugin (WebView + asset loader + IPC channel). Solid.
- `apps/capacitor/src/services/dual-screen.ts` — TS plugin wrapper, `pushState` + `addListener('command')` API.
- `apps/capacitor/src/dual-screen/{bridge,mount}.ts` — primary-side: subscribes to bus, forwards to plugin.
- `apps/capacitor/src/services/reader-bus.ts` + `reader-broadcast.tsx` — generic publish/subscribe bus with state, context, appShell, library, activeBook, settings, action registry. Already powers everything in primary; will continue to be the IPC source of truth.
- `apps/capacitor/src/services/secondary-publisher.tsx` — central component pulling theme/route/books/settings from primary and publishing to bus. Move it inside the router (already is).
- The 4-line publish points in `pages/reader/index.tsx` and `pages/reader/rsvp-view.tsx`.
- `apps/capacitor/src/secondary/bus.ts` — secondary-side IPC wrapper around `window.__DualScreen` / `window.__DualScreenNative`. Generic; reuse for the new architecture.

### Code to delete
- `apps/capacitor/src/secondary/index.tsx` — bespoke `<SecondaryApp />` shell.
- `apps/capacitor/src/secondary/views/{controls,cover,library,settings}.tsx` — duplicated UI.
- `apps/capacitor/src/secondary/{theme,ui}.tsx` — secondary-specific palette + components.

### New work

**1. Entry branching (`src/main.tsx`)**
- Load `<App />` for both primary and secondary. Pass `isSecondary` to App or set a query-param-derived module-level flag.
- Keep the existing Ionic + monochrome CSS imports here (already moved in this branch — keep).

**2. Provider gating in `src/App.tsx`**
- When `isSecondary`: skip `DatabaseProvider`, `BLEProvider`, `BookSyncProvider`, `SyncProvider`, `ShareIntentHandler`. These all assume native plugins.
- Mount a `SecondaryDatabaseProvider` instead — see (3).
- Drop `<SplashScreen.hide()>` etc. side effects when secondary.
- Skip `tryEnableDualScreen()` in secondary (only primary triggers the secondary's existence).
- The router stays — secondary still uses `IonReactRouter`. Optionally land on `/tabs/library` by default.

**3. `SecondaryDatabaseProvider` (new file in `src/secondary/`)**
- No SQLite. Subscribes to `subscribeSnapshot()` (the secondary's bus).
- On each snapshot, populates the `queryClient` cache:
  - `queryClient.setQueryData(bookKeys.all, { books: snap.library, covers: ... })`
  - `queryClient.setQueryData(settingsKeys.all, snap.settings)`
  - `queryClient.setQueryData(bookKeys.detail(activeBookId), snap.activeBook)`
- Because all queries use `staleTime: Infinity`, components reading via `queryHooks.useBooks()` / `useSettings()` get cached data and never invoke the missing SQLite `queryFn`.

**4. Mutation redirection**
- Hooks like `useSaveSettings`, `useImportBook`, `useDeleteBook` need to fire bus commands on secondary instead of writing to SQLite.
- Two options:
  - (a) Extend each hook with an `if (isSecondary) sendCommand(...)` branch.
  - (b) Override `useMutation`'s `mutationFn` via a wrapper provider.
- (a) is simpler and more transparent. Each affected hook gets ~3 lines.
- For settings specifically: `updateSetting(key, value)` → `sendCommand({ kind: "updateSetting", key, value })`. Primary's existing `SecondaryPublisher.registerAppShellActions` already routes those into `useAutoSaveSettings.updateSetting` — works today.

**5. Extend the bus for any missing surfaces**
- Snapshot already has: state, context, appShell, library, activeBook, settings.
- Probably need to add: full `BookContent` for active book (so reader page on secondary can render), highlights, etc. — only push when actually needed (lazy fetch via command).
- Glossary entries, sync state, BLE state — most are not needed on secondary; gate the UI not the data.

**6. UI gating for secondary**
- Some pages are non-sensical on secondary (Device/BLE settings, Cloud sync sign-in, Onboarding). Hide via `isSecondary` route guards or page-level early returns.
- Tab bar can stay — Library + Settings is the primary use case for screen 2.
- The reader page on secondary should render *something useful* when an RSVP session is active on primary — could be the controls strip overlay, or just the same RsvpView in spectator mode.

**7. Plugin guards**
- BLE: already gated by `Capacitor.getPlatform()`. Add `|| isSecondary` to those checks.
- Share intent: same.
- Sync: skip on secondary (the cookie/token is on primary).

### Verification
1. Secondary loads `<App />`, lands on `/tabs/library`, shows real library list (not the bespoke version).
2. Tap a book on screen 2 → primary navigates to that book's reader.
3. Open RSVP settings on screen 2 → real `RsvpSettingsForm` renders → move sliders → primary settings update (via command → `updateSetting` → existing `useAutoSaveSettings` → cloud sync + ESP32 BLE all flow normally).
4. Theme change on either screen → both repaint.
5. No new "secondary-only" UI components; the secondary tree is just `<App />` with a different data backing.
6. Bundle audit: lazy chunk for the dual-screen entry stays small; main bundle unchanged for non-Thor users.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Current state (committed to a feature branch — main is untouched)

### What works on the Thor right now
- Plugin spawns a real WebView on Screen-2 via `WebViewAssetLoader`. Loads `https://appassets.androidplatform.net/?screen=2`.
- Bidirectional IPC: `DualScreen.pushState()` from primary → JS evaluation in secondary; `window.__DualScreenNative.command()` from secondary → Capacitor event listener on primary.
- Bus-driven state forwarding: theme, active route, library list, active book (with cover), full RSVP engine state (current word, isPlaying, wpm, wordIndex), book/chapter context, settings.
- The bespoke `<SecondaryApp />` tree renders Library / Cover / Controls / Settings views with bottom-tab navigation (or the cog overlay variant — currently mid-edit).
- Controls work: tap Play/Pause on screen 2 → primary's `useRsvpEngine.togglePlayPause` fires.
- Tap a book in secondary library → primary navigates to that book.
- Slider changes in secondary settings → primary's `useAutoSaveSettings.updateSetting` fires (cloud sync + ESP32 BLE round-trip works).
- Lifecycle: dismiss on background, re-show on foreground, primary/secondary swap when app launched on bottom screen.

### Why the architecture is wrong
- The bespoke secondary tree duplicates UI (settings form rebuilt with `<input type="range">` + handwritten gear SVG instead of `RsvpSettingsForm` + `IonRange` + `ionicons`).
- Visual drift between primary (Ionic monochrome theme) and secondary (custom palette).
- "Active book" cover view locks the user to most-recently-read with no way to switch — the navigation flow is bespoke and incomplete.
- Iconography is hand-coded SVG (the cog was malformed).
- Adding any new feature means writing it twice.

### Confirmed technical facts (from spike)
- `Capacitor.getPlatform()` returns `"web"` inside the secondary WebView (no bridge).
- `WebViewAssetLoader` + custom `PathHandler` mapping `assets/public/` works.
- `evaluateJavascript` payloads up to ~10KB+ (including base64 covers) go through fine.
- React Query `staleTime: Infinity` (already the default in this codebase — see `apps/capacitor/src/services/query-client.ts`) means cache pre-population works without ever invoking missing `queryFn`s.

### Files added on the feature branch
- `apps/capacitor/src/secondary/{index,bus,theme,ui}.tsx`
- `apps/capacitor/src/secondary/views/{controls,cover,library,settings}.tsx`
- `apps/capacitor/src/services/{reader-bus,reader-broadcast,secondary-publisher,dual-screen}.ts(x)`
- `apps/capacitor/src/dual-screen/{bridge,mount}.ts`
- `apps/capacitor/android/app/src/main/java/app/lesefluss/DualScreenPlugin.java`
- `androidx.webkit:webkit:1.11.0` added to `apps/capacitor/android/app/build.gradle`

### Files modified on the feature branch
- `apps/capacitor/src/main.tsx` — branches on `?screen=2`, loads `SecondaryApp` lazy chunk.
- `apps/capacitor/src/App.tsx` — Ionic CSS moved to main.tsx (necessary for secondary). `<SecondaryPublisher />` mounted inside router.
- `apps/capacitor/src/pages/reader/{index,rsvp-view}.tsx` — 4 lines total of `<ReaderEngineBroadcast>` + `<ReaderContextBroadcast>` publishing to bus. **These can stay; they're the right pattern.**
- `apps/capacitor/android/app/src/main/java/app/lesefluss/MainActivity.java` — `registerPlugin(DualScreenPlugin.class)`.

### Pivot effort estimate
~3–4 hours focused work:
1. Delete `secondary/views/`, `secondary/theme.ts`, `secondary/ui.tsx`, `secondary/index.tsx`. Keep `secondary/bus.ts`.
2. Refactor `main.tsx`: always load `<App />`; export an `isSecondary` flag.
3. Refactor `App.tsx`: gate providers + UI by `isSecondary`.
4. Create `SecondaryDatabaseProvider` that hydrates queryClient from bus.
5. Patch the ~5 mutation hooks to redirect to bus commands when secondary.
6. Test on Thor.

### Risk
- Some providers (BookSyncProvider especially) may have side effects that misbehave when DatabaseProvider is missing. Need careful gating.
- Onboarding flow may try to redirect on secondary (RootRedirect uses `useSettings()`); needs a guard.
- IonReactRouter on a 1240×1080 second screen with the existing tab bar may look cramped — minor CSS tuning needed.
<!-- SECTION:NOTES:END -->
