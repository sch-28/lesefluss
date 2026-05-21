# Capacitor App Redesign Plan

**Status**: Scoping. Not yet approved.
**Scope**: Replace Ionic with shadcn + Tailwind + TanStack Router across `apps/capacitor`.
**Reference template**: `/home/jan/dev/spielfluss/apps/capacitor/` (already shipped, same monorepo style).

---

## 1. Motivation

Current pain in `apps/capacitor`:

1. **Visual mismatch** across web / extension / capacitor — three different design languages.
2. **Ionic router bugs** — tab bar flashes in/out on `book ↔ list` navigation (root cause: Ionic shadow-DOM toggles `.tab-bar-hidden` on keyboard events, races with our manual `body.reader-open` toggle).
3. **Styling inconsistency** — 711 `className` Tailwind usages mixed with Ionic CSS vars, `monochrome.css`, one-off `.css` files (`toast.css`), and Ionic utility classes (`ion-padding`, `ion-text-center`).
4. **Theme handling fragmented** — three themes (`dark` / `sepia` / `light`) defined via Ionic CSS vars in `monochrome.css`; light/sepia branches incomplete; theme applied via `document.body.classList`.
5. **Hacks around Ionic primitives** — modal/popover/action-sheet wrappers fight Ionic's defaults (floating menu, dialog stacking, breakpoint sheets).

## 2. Target architecture (mirror spielfluss)

| Concern | Current (Ionic) | Target (mirror spielfluss) |
|---|---|---|
| Router | `react-router-dom` v5 + `@ionic/react-router` + `IonRouterOutlet` | `@tanstack/react-router` with file-based routes via `@tanstack/router-plugin` |
| Page shell | `IonPage` / `IonHeader` / `IonContent` / `IonToolbar` | Plain `div` + custom `AppShell` + Tailwind layout |
| Bottom tab bar | `IonTabs` + `IonTabBar` + `IonTabButton` | Custom `TabBar.tsx` component, `fixed inset-x-0 bottom-0 z-40 md:hidden` |
| Desktop nav | `desktop-sidebar.tsx` (Ionic internals) | Custom collapsible `DesktopSidebar` with `--side-nav-w` CSS var + `localStorage` persistence |
| Modal | `IonModal` (5 files) | shadcn `Dialog` |
| Bottom sheet | `IonModal` w/ breakpoints (2 files) | shadcn `Sheet` w/ `side="bottom"` |
| Popover | `IonPopover` (4 files) | shadcn `Popover` |
| Action sheet | `IonActionSheet` (5 files) | shadcn `Sheet` w/ `side="bottom"` + action list, OR `DropdownMenu` |
| Alert | `IonAlert` (19 files) | shadcn `AlertDialog` or `Sheet` variant |
| Form inputs | `IonInput` / `IonTextarea` / `IonSelect` / `IonToggle` / `IonRange` / `IonRadio` / `IonCheckbox` | shadcn `Input` / `Textarea` / `Select` / `Switch` / `Slider` / `RadioGroup` / `Checkbox` |
| List | `IonList` / `IonItem` / `IonLabel` / `IonNote` / `IonListHeader` / `IonItemDivider` | Plain semantic HTML + Tailwind |
| Icons | `IonIcon` + `ionicons` | `lucide-react` (already in deps) |
| Loading | `IonSpinner` | shadcn spinner / Loader2 from lucide |
| Toast | `IonToast` + custom `toast.css` | `sonner` (mirror spielfluss styling) |
| Safe area | Ionic auto | CSS `env(safe-area-inset-*)` everywhere |
| Theme | 3 themes via body class, Ionic CSS vars | 3 themes via `:root` + `.sepia` + `.light` (default = dark), shadcn tokens only |
| Status bar | Ionic default | `@capacitor/status-bar` plugin (add) |
| Keyboard | Ionic auto-resize | `@capacitor/keyboard` plugin (add) — manual inset adjust if needed |

## 3. Migration surface

From investigation:

- **62 files** import `@ionic/react`.
- **~60K LOC** TSX/TS in capacitor app.
- Top components by count: `IonLabel` (164), `IonIcon` (130), `IonButton` (128), `IonItem` (106), `IonContent` (88), `IonHeader` (66), `IonToolbar` (64), `IonPage` (58), `IonList` (51).
- **22+ files** with modals/popovers/action-sheets.
- **10+ files** with Ionic routing hooks (`useIonRouter`, `useIonViewWillEnter`).
- DB layer (Drizzle + `@capacitor-community/sqlite`) and `packages/*` deps (`book-import`, `ble-config`, `core`) are **decoupled** from UI — zero changes needed.

## 4. What we keep

- Drizzle schema + 24 migrations.
- `@capacitor-community/sqlite`, `bluetooth-le`, all `@capacitor/*` utility plugins.
- BLE / ESP32 sync logic.
- All `packages/*` (book-import, ble-config, core, rsvp-core).
- Reader engine internals (RSVP, scroll-view, page-view, virtualization via `virtua`).
- EPUB / PDF parsing (`epubjs`, `pdfjs-dist`, `@mozilla/readability`).
- Stats / Nivo charts.
- Onboarding flow logic (steps only — UI rebuilt).
- `better-auth` integration.

## 5. What we drop

- `@ionic/react`, `@ionic/react-router`, `@ionic/core`, `ionicons`.
- `react-router-dom` v5 + `react-router` v5.
- `theme/monochrome.css` (89KB) — replaced by Tailwind tokens.
- `components/toast.css` — replaced by sonner.
- All `IonPage` wrappers and Ionic page-lifecycle hooks.

## 6. What we add

- `@tanstack/react-router` + `@tanstack/router-plugin`.
- `radix-ui` primitives (`Dialog`, `Popover`, `Slot`, etc.).
- `sonner` for toasts.
- `cmdk` if we want a command palette (optional).
- `tw-animate-css` to mirror spielfluss animations.
- `@capacitor/status-bar` + `@capacitor/keyboard` plugins.
- `class-variance-authority` + `clsx` + `tailwind-merge` for shadcn primitives.

## 7. Proposed file layout (new)

```
apps/capacitor/src/
├── main.tsx                       # mount React, no Ionic setup
├── router.tsx                     # createRouter() w/ routeTree
├── routeTree.gen.ts               # auto-generated by vite plugin
├── styles.css                     # ONE entrypoint — tokens + utilities (mirror spielfluss)
├── routes/
│   ├── __root.tsx                 # AppShell wrapper
│   ├── index.tsx                  # / -> redirect to library or onboarding
│   ├── onboarding/                # full-screen, no AppShell
│   ├── library/
│   │   ├── index.tsx
│   │   ├── book.$id.tsx
│   │   ├── series.$id.tsx
│   │   └── stats.tsx
│   ├── explore/
│   │   ├── index.tsx
│   │   ├── book.$catalogId.tsx
│   │   ├── web-novels.tsx
│   │   └── web-novels.preview.tsx
│   ├── settings/
│   │   ├── index.tsx
│   │   ├── appearance.tsx
│   │   ├── rsvp.tsx
│   │   ├── device.tsx
│   │   ├── sync.tsx
│   │   └── export.tsx
│   └── reader.$id.tsx             # full-screen, no AppShell
├── components/
│   ├── ui/                        # shadcn primitives (Button, Sheet, Dialog, Input, ...)
│   ├── app-shell/
│   │   ├── AppShell.tsx
│   │   ├── TabBar.tsx             # mobile bottom nav
│   │   ├── DesktopSidebar.tsx     # md:+ sidebar
│   │   └── TopBar.tsx             # optional top strip
│   └── (existing feature components, ported)
├── contexts/
│   └── theme-context.tsx          # kept; switches class on <html> instead of <body>
├── pages/                         # KEEP during migration; delete file-by-file
└── services/                      # db/, sync/, ble/ — unchanged
```

## 8. Phased migration strategy

Big-bang rewrite = high risk. Recommend **gradual swap** with the ionic + tanstack routers co-existing temporarily. Concretely:

### Phase 0 — Prep (no UI change)
- Install new deps (`@tanstack/react-router`, `@tanstack/router-plugin`, `radix-ui`, `sonner`, `cva`, `clsx`, `tailwind-merge`, `tw-animate-css`).
- Add `@capacitor/status-bar` + `@capacitor/keyboard` plugins.
- Copy spielfluss's `styles.css` token block; adapt palette to lesefluss brand (open Q).
- Scaffold shadcn primitives in `src/components/ui/` (`button.tsx`, `sheet.tsx`, `dialog.tsx`, `popover.tsx`, `input.tsx`, `textarea.tsx`, `select.tsx`, `switch.tsx`, `slider.tsx`, `radio.tsx`, `checkbox.tsx`, `alert-dialog.tsx`, `dropdown-menu.tsx`, `tabs.tsx`, `label.tsx`, `separator.tsx`, `badge.tsx`, `card.tsx`).
- **No visual change yet.** Build still uses Ionic. Verify everything compiles.

### Phase 1 — Shell + routing
- Build `AppShell`, `TabBar`, `DesktopSidebar`, `TopBar`.
- Set up TanStack Router with file-based routes.
- Keep Ionic in parallel: TanStack Router renders the AppShell + tabbar; Ionic still owns page rendering inside an `<Outlet />` until pages migrate.
- **OR** (cleaner) — branch the work and rewrite shell + 1 page (Settings → simplest) end-to-end first. Validate pattern. Then proceed.
- Recommend **branch + rewrite settings page first** as the canary. Settings has the fewest dependencies and most Ionic form primitives — proves out shadcn coverage.

### Phase 2 — Pages, sorted by simplicity
1. Settings (all subpages) — form primitives heavy, low logic.
2. Onboarding — full-screen, isolated, easy to test.
3. Explore (catalog search) — read-only, no complex modals.
4. Library list/grid + popovers (filter/sort).
5. Library book-detail + series-detail.
6. Modals: paste-url, import-sheet, transfer-modal, whats-new.
7. **Reader** (last — most complex, owns selection-overlay, dictionary, glossary, highlights, RSVP, scroll, page-view). Reader is full-screen, so tab-bar flashing bug **goes away by construction**.
8. Stats dashboard.

### Phase 3 — Cleanup
- Delete `theme/monochrome.css`, `theme/variables.css`, `components/toast.css`.
- Remove all `@ionic/*` + `react-router-dom` deps.
- Remove `ionic.config.json`.
- Run full bundle-size diff (expect significant drop — Ionic core is ~200KB).

## 9. Theme strategy

Spielfluss has **single theme** (CRT dark). Lesefluss has **three** (light/dark/sepia). We keep three. Approach:

- All tokens defined as CSS vars on `:root` (= dark, default).
- `.light` and `.sepia` classes on `<html>` override the same token names.
- Single `--background`, `--foreground`, `--primary`, etc. — no `--ion-color-*`.
- `theme-context.tsx` keeps its current API but toggles class on `<html>` instead of `<body>` (more idiomatic for shadcn / radix portals).
- shadcn primitives reference `bg-background`, `text-foreground`, etc. — they "just work" for all three themes.

## 10. Bottom-tab flashing fix

Root cause is **Ionic's shadow DOM**. Once we drop `IonTabBar`, the bug **cannot recur** — our custom `TabBar` is just a `fixed` div whose visibility is driven by route metadata (e.g., `__root.tsx` checks `useMatches()` for a `fullScreen: true` flag and conditionally renders the tab bar). No keyboard listeners, no shadow DOM.

## 11. Capacitor integration notes

- **Status bar**: add `@capacitor/status-bar` — set style on theme change (light status bar on dark theme).
- **Keyboard**: add `@capacitor/keyboard`. Use `resize: "native"` mode + `keyboardWillShow` listener if any view needs to scroll an input into view. Avoid Ionic's auto-resize quirks.
- **Hardware back**: `@capacitor/app` `backButton` listener → router `history.back()`. Block at root → `App.exitApp()`.
- **Deep links**: spielfluss pattern in `lib/use-mobile-auth-callback.ts` is reusable — `lesefluss://` scheme.
- **Safe-area**: `env(safe-area-inset-top/bottom)` everywhere. AppShell pads top by `top-bar-h + safe-area-top` and bottom by `tab-bar-h + safe-area-bottom`.

## 12. Risks

| Risk | Mitigation |
|---|---|
| Reader is huge + has selection-overlay glued to native gestures | Migrate reader **last**, after all primitives proven. Selection-overlay already pure DOM, low Ionic coupling. |
| Page transitions feel worse without Ionic's stack animation | Acceptable — spielfluss ships with no transitions and feels fast. Can add CSS view-transitions later if needed. |
| Drizzle / sqlite init order changes if we remove Ionic bootstrapping | DB init is in `services/db/`, not coupled to Ionic. Verify but expect no change. |
| Better-auth flows break (OAuth redirect was Ionic-aware?) | Audit — likely independent. |
| 3-week+ effort lands on `main` while other features in flight | Do it on a long-lived branch `redesign/capacitor-shadcn`. Rebase weekly. Or do feature-flag flips per page (harder). |
| Bundle of two routers + Ionic during migration is heavy | Keep dev-only; ship only after Phase 3 cleanup. Do not release intermediate state. |
| Some Ionic components have no clean shadcn equiv (`IonSegment` for reader mode toggle) | Use shadcn `Tabs` or `ToggleGroup` (radix) — both fit. |
| Long-press handling, swipe-to-delete, pull-to-refresh — Ionic-provided | Reimplement with hooks (already have `use-long-press.ts`); pull-to-refresh likely unused; swipe-actions evaluated case-by-case. |

## 13. Effort estimate

Rough: **2–4 weeks** of focused work, depending on reader complexity and visual polish bar. Breakdown:

- Phase 0 (prep, primitives, tokens): 1–2 days.
- Phase 1 (shell + router): 1–2 days.
- Phase 2 pages: 1–2 weeks (~30 page-like files).
- Reader rewrite: 3–5 days alone.
- Phase 3 cleanup + regression: 1–2 days.

## 14. Decisions (answered 2026-05-19)

1. **Visual direction**: **Decided — keep current web aesthetic.** Capacitor mirrors web. Use existing palette + tokens from `apps/web/src/styles/app.css`. Explorations parked in `docs/design-explorations/` for reference.
2. **Themes**: Keep all three (light / dark / sepia). Sepia stays — trivial cost (one extra class variant).
3. **Reader sepia separate from app**: No. Single theme system.
4. **Router migration**: Big-bang on branch `redesign/capacitor-shadcn`.
5. **Page transitions**: None initially. Revisit after migration lands.
6. **Shared UI package**: **Extract to `packages/ui` during Phase 0.**
   - Atomic primitives (Button, Input, Dialog, Sheet, Popover, Select, Switch, Slider, etc.) → `packages/ui/src/`.
   - Tokens (`tokens.css` w/ `:root` + `.dark` + `.sepia` + `.light`) → `packages/ui/src/styles/tokens.css`. Each app imports.
   - App-local stays app-local: layout shell (Sidebar/TopBar/TabBar) since form-factor differs across web/ext/cap.
   - Web + extension migrate to consume `packages/ui` as part of this work (small lift; few primitives today).
7. **Bottom-tab IA**: Keep three tabs — Library / Explore / Settings.
8. **Top bar**: No unified strip. Per-route headers stay (filter in library, reader controls in reader, etc.). Each route owns its own header component.
9. **OAuth deep-link**: already implemented and working. No action needed.

## 15. Next steps

1. Open branch `redesign/capacitor-shadcn`.
2. Phase 0: extract `packages/ui` from `apps/web/src/components/ui/`. Move tokens (`:root`, `.dark`, `.sepia`) into `packages/ui/src/styles/tokens.css`. Web + extension migrate to consume `packages/ui`.
3. Phase 0 cont.: install deps in capacitor (`@tanstack/react-router` + plugin, radix primitives, sonner, cva, clsx, tailwind-merge, tw-animate-css, `@capacitor/status-bar`, `@capacitor/keyboard`).
4. Phase 1: AppShell + TabBar + DesktopSidebar + TanStack router skeleton.
5. Phase 2: rewrite Settings as canary, then proceed page-by-page per §8 order.
