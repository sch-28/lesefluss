---
id: TASK-205.4
title: High-contrast reader theme
status: Done
assignee:
  - '@claude'
created_date: '2026-10-20 22:23'
updated_date: '2026-10-28 19:29'
labels:
  - reader
  - accessibility
milestone: m-13
dependencies:
  - TASK-205.9
parent_task_id: TASK-205
priority: low
ordinal: 176000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Low-vision readers need a high-contrast theme. Thorium and the platform readers offer one. Lesefluss has Dark, Sepia and Light, and the only pure-contrast palette is E-ink mode. E-ink mode also forces page mode and strips animations, which is not what a phone user who wants high contrast is asking for.

Add a high-contrast theme, such as yellow or white on pure black, that meets WCAG AAA contrast. It changes colours only.

Findings from the 2026-10-21 review:
- **Sync, high risk.** SyncSettingsSchema.readerTheme is `z.enum(["dark","sepia","light"])` (packages/core/src/sync.ts). The server safeParses the whole push payload (apps/web/src/routes/api/sync.ts). A new client talking to an old server would fail the entire push, including books, highlights and positions. So the server change must deploy before clients send the new value. Old clients already fall back to dark (theme-context.tsx), and pulls are not validated.
- **Where theme names are hard-coded.** The Tailwind `dark:` variant is bound to the `.dark` class (packages/ui/src/styles/tokens.css) and used in about 13 files. nivo-theme.ts and wpm-trend.tsx branch on "dark". VALID_THEMES in theme-context.tsx, index.html and use-appearance-settings.ts list the themes. Line-art image inversion applies only under .reader-theme-dark (monochrome.css). High contrast must count as dark everywhere.
- Highlights use 35% alpha and the spoken-word mark is mixed at 32%. Both need checking against black.
- **Progress risk.** A theme switch does not remount the reader. But the page-mode layoutKey ignores theme, so the theme must not change font metrics (weight, size, spacing), or pagination goes stale and the anchor drifts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 New high-contrast theme selectable alongside Dark/Sepia/Light
- [x] #2 Body text and reader chrome meet WCAG AAA (7:1) contrast
- [x] #3 All four highlight colors, glossary underline, links, active-word underline, spoken-word mark and RSVP focal letter remain visible and distinguishable
- [x] #4 Tailwind dark: variants, stats charts and line-art image inversion treat high-contrast as a dark theme; EPUB images remain viewable
- [ ] #5 SyncSettingsSchema accepts the new value and the server change is deployed before clients send it; old clients render it as dark without error; a sync push containing it never fails on an up-to-date server
- [x] #6 Theme changes colors only (no font-weight/size/spacing change); switching theme mid-chapter keeps the same first visible word in scroll and page mode and does not save a new position
- [ ] #7 pnpm build and Android build succeed; Playwright e2e covers switching to high-contrast mid-chapter without position change in scroll and page mode; existing appearance-persist, page-mode-appearance-anchor and position-* e2e specs pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Value: readerTheme 'high-contrast' (label 'High contrast'). Colours only: no font-weight/size/spacing/border-width changes; extra cues use box-shadow and text-decoration, which never move text.

1. Palette (WCAG ratios measured against #000000)
- App tokens (.dark.high-contrast, in apps/capacitor/src/theme/variables.css so packages/ui and the web app stay untouched): background/sidebar #000000; foreground/card-foreground/popover-foreground #ffffff (21:1); card/popover/secondary/muted/accent #0d0d0d (white on it 19.4:1); muted-foreground #c8c8c8 (12.6:1; 11.6:1 on card); primary/ring #ffd60a (14.9:1) with primary-foreground #000000 (14.9:1); destructive #ff7b7b (8.4:1); border/input #8a8a8a (6.1:1, non-text minimum is 3:1); goal-pending #ff8f73 (9.4:1); goal-met #4ade80 (12.1:1).
- Reader vars (.reader-theme-high-contrast, monochrome.css): --reader-bg #000000, --reader-text and --reader-heading #ffffff (21:1), --reader-progress-bg #333333, --reader-progress-fill #ffffff, --reader-progress-label #c8c8c8 (12.6:1). Links #7fd4ff (12.8:1), kept apart from the yellow highlight and the yellow primary.
- Highlights keep the 35% fill, which keeps text AAA on it (white on yellow 7.95, blue 11.0, orange 9.7, pink 12.7). The fill alone is only 1.7-2.6:1 against black, so HC adds box-shadow: inset 0 -2px 0 <swatch> (swatch vs black: yellow 17.4, blue 9.6, orange 12.3, pink 6.6, all above 3:1). Raising the alpha to 50% is rejected: white on the yellow fill drops to 4.6.
- Spoken word (::highlight(tts-word)): the 32% mix gives #525252, which keeps white text at 7.8:1 but sits at only 2.7:1 against black, so HC adds text-decoration: underline 2px #ffd60a (allowed in ::highlight, no layout effect). Selection (16%) stays: 14.6:1.
- Glossary underline and active-word underline: HC maps their default colour to #ffd60a. A user-picked glossary colour under 3:1 against black is lifted to the default in HC only (stored value untouched).
- RSVP focal letter: presets on black are red 5.25, orange 8.9, yellow 13.9, green 9.4, blue 6.3, purple 7.9. Red and blue are under 7:1 -> owner decision (see notes). Default plan: keep the user's colour (it is their setting and still passes AA), no override.

2. 'Counts as dark everywhere' = a class pair
- theme-context: AppTheme gains 'high-contrast'; VALID_THEMES lists it; applyAppearance adds 'dark' AND 'high-contrast' to html/body (removes both on any other theme). Every Tailwind dark: variant (bound to .dark) and every body.dark rule then apply unchanged; the .dark.high-contrast tokens override the dark ones by specificity.
- Export isDarkTheme(theme) (dark or high-contrast); nivo-theme.ts and wpm-trend.tsx use it instead of === 'dark', and getAccentStops gets an HC case (yellow stops).
- Reader: every site already renders reader-theme-${theme}, so they emit reader-theme-high-contrast with no TSX change (none of the 205.6 reader files). monochrome.css adds .reader-theme-high-contrast next to .reader-theme-dark for line-art inversion and glossary-modal marks. Other EPUB images are not touched, as in dark.
- index.html inline script: cached 'high-contrast' adds both classes on first paint. use-appearance-settings: new option. appearance-pickers: black/white/yellow-border swatch.
- E-ink keeps overriding to light; the stored HC value is untouched. Old clients map the unknown value to dark (storedThemeFor, shipped in 205.9).

3. Deploy-order guard built into the client
- Core: readerTheme enum gains 'high-contrast'. New GATED_SETTING_VALUES = { readerTheme: ['high-contrast'] }: values a server must advertise before a client sends them.
- Server: GET /api/sync adds acceptedSettingValues (Record<key, string[]>), generated from the SyncSettingsSchema enum options, so every future enum value advertises itself.
- Client: the last acceptedSettingValues is cached (Preferences, account-scoped, cleared with the other per-account state). settingsToSync: for a gated value the server has not advertised (old server, or no pull yet), the field carries the server's last pulled value for that key (fallback 'dark'), never omitted. Omitting it would 400 a server older than 205.9, which still parses settings strictly. The push is valid on every server version and never fails, and other devices keep their theme instead of seeing a value their server dropped.
- Withheld flag: when a value was swapped, the client sets sync_settings_withheld. On a later pull that advertises the value, it bumps local settings.updatedAt to now and schedules a push, then clears the flag once that push is accepted. This beats the strict > LWW guard that otherwise strands the value (the 205.9 drift note). shouldAdoptServerSettings is unaffected: the server's updatedAt equals the local one, so the pull does not adopt the server's theme over the local HC.
- The server deploy still goes first in practice, but a client released before it degrades to 'HC is local until the server knows it' instead of failing or drifting.

4. Tests
- core: enum accepts HC; acceptedSettingValues options helper; GATED map consistent with the schema.
- web: GET returns acceptedSettingValues incl. readerTheme HC; push with HC stored (integration).
- capacitor: settingsToSync gating (no capability / capability without value / with value); withheld bump on capability arrival (updatedAt raised, push scheduled, flag cleared only after acceptance); storedThemeFor/isDarkTheme; applyAppearance class pair; nivo accent HC.
- e2e (written by me, run by planner): new high-contrast-theme.spec.ts:
  a. switch to HC mid-chapter in scroll mode: same first visible word, no position save;
  b. same in page mode (page index and anchor unchanged);
  c. html carries dark + high-contrast; reader root reader-theme-high-contrast; a line-art figure is inverted, a photo is not;
  d. computed reader text/background and chrome foreground/background >= 7:1 (evaluated in page);
  e. restart keeps HC with no non-HC first paint (index.html cache);
  f. sync gate: mocked GET without acceptedSettingValues -> pushed settings.readerTheme is the server's last value; with it -> 'high-contrast' with a bumped updatedAt.
  Existing to rerun: appearance-persist, page-mode-appearance-anchor, position-*, eink-mode, highlights-modes, read-aloud-position.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-28 plan (lesefluss-worker-2). AC #5 deploy order: guarded in the client (see plan section 3); the server deploy still precedes the client release.
Owner decisions open:
- Body text white (#ffffff, 21:1) vs yellow (#ffff00, 19.6:1). Plan assumes white text with yellow accents.
- RSVP focal letter red (5.25:1) and blue (6.3:1) are under AAA on black. Plan keeps the user's colour; the alternative is lightening red/blue in HC only.
Files I would touch:
- packages/core/src/sync.ts, packages/core/src/settings.ts (if GATED lives there), core tests
- apps/web/src/routes/api/sync.ts, web test
- apps/capacitor/src/services/sync/index.ts, services/sync/session.ts, sync tests
- apps/capacitor/src/contexts/theme-context.tsx, apps/capacitor/src/index.html, hooks/use-appearance-settings.ts (+test), components/appearance-pickers.tsx
- apps/capacitor/src/theme/variables.css, theme/monochrome.css
- pages/library/stats/nivo-theme.ts, pages/library/stats/wpm-trend.tsx
- e2e/high-contrast-theme.spec.ts (new)
No reader TSX (paragraph, scroll-view, page-view, toolbar, appearance-popover, read-aloud) changes needed.

2026-10-28 plan approved by planner, incl. the client-side gate. Decisions are planner defaults, not owner-confirmed: 1) white body text with yellow accents; 2) lighten the red and blue RSVP focal presets in HC only, to reach AAA. Order: TASK-187 review fixes first, then 205.4.

2026-10-28 implementation:
- Core: READER_THEMES (settings.ts) incl. 'high-contrast'; readerTheme enum uses it. acceptedSettingValues() (enum options per key), GATED_SETTING_VALUES { readerTheme: ['high-contrast'] }, gateSettingsForServer (swap an unadvertised gated value for the server's last value or the first ungated option; never omit, so a pre-205.9 strict server still parses), hasNewlyAcceptedValue. SyncResponse.acceptedSettingValues optional.
- Web: GET /api/sync returns acceptedSettingValues.
- Capacitor sync: services/sync/setting-caps.ts caches accepted values + the server's gated values per pull (account-scoped, cleared with account state) and a withheld flag. The push gates settings and stores the flag. A pull that sees the value accepted while the flag is set bumps local settings.updatedAt (saveSettings({}, now)), so the next push beats the strict > guard.
- Theme: AppTheme = ReaderTheme; themeClasses() puts 'dark high-contrast' on html/body; isDarkTheme() for nivo/wpm-trend; index.html first paint adds both classes and a black background; THEMES gains 'High contrast'; ThemeCards 4 across / 2x2 / 1 column.
- CSS: .dark.high-contrast tokens in theme/variables.css (app-only, packages/ui untouched); .reader-theme-high-contrast vars, line-art inversion, glossary mark, highlight inset underlines, link #7fd4ff, active-word underline #ffd60a, glossary avatar ring, tts-word yellow underline (monochrome.css). Colours/shadows/decorations only.
- RSVP focal: focalLetterColorFor lightens #ff0000 -> #ff6b6b (7.6:1) and #448aff -> #82b1ff (9.7:1) in HC only (rsvp-view, rsvp-preview); the stored setting is unchanged.
- Tests: core setting-gate (8), capacitor setting-gate-sync (3; bump mutation-checked), theme-context helpers, web integration (HC stored; GET advertises it). e2e: e2e/high-contrast-theme.spec.ts (written, not run): scroll mode no reflow/no save, page mode same first word/no save, dark class + AAA computed contrast, first-paint classes after restart, sync gate dark-then-HC.
- Not covered in e2e: line-art inversion (no line-art fixture in e2e helpers). The CSS selector mirrors dark.
- Open: the reader appearance popover (205.6's file) now lays out 4 theme toggles in its w-80 popover; 'High contrast' may be tight there. AC7 builds (pnpm build, Android) not run by me.

2026-10-28 review round (planner decision: client sync gate REMOVED, it was planner-requested and wrong: the web /app ships in the server image, native releases follow the server deploy, 205.9 already makes server-first a hard rule, and the gate lost HC when another device edited settings while it was withheld). All gate code, tests and the e2e case are gone; only the READER_THEMES enum change stays.
AC5 OWNER NOTE: deploy the server before any client ships 'high-contrast'. An older server drops the value and the devices drift (205.9). The rule is now in AGENTS.md 'Adding a New Setting' step 9.
Round fixes: HC overrides for book-detail cards/titles, toggle-group selected state (inset ring), switch thumb (black on yellow), destructive (#ffa0a0, hover held at 20%), text-muted-foreground/70 -> full muted, reader progress track #4d4d4d, active word dotted white (distinct from the spoken word's yellow), glossary-modal mark inset underline, links #b3e5ff, RSVP focal swatches in settings show focalLetterColorFor. Pre-existing: StatusBar style follows isDarkTheme (ThemeProvider effect, native only), sonner Toaster gets the app theme via a dark prop from __root, color-scheme: dark on .dark. e2e: exact computed values (text, body, --primary, --reader-text, highlight box-shadow), first-paint classes at readyState interactive, page-mode word boxes compared.
FILES WITH 205.4 HUNKS (for splitting commits): packages/core/src/settings.ts, packages/core/src/sync.ts, apps/web/src/lib/sync-settings-upsert.integration.test.ts, apps/capacitor/src/contexts/theme-context.tsx (+ __tests__/theme-context.test.ts), src/index.html, src/hooks/use-appearance-settings.ts, src/components/appearance-pickers.tsx, src/components/toast.tsx, src/routes/__root.tsx, src/theme/variables.css, src/theme/monochrome.css, src/pages/library/stats/nivo-theme.ts, src/pages/library/stats/wpm-trend.tsx, src/pages/reader/rsvp-view.tsx, src/pages/settings/rsvp-preview.tsx, src/pages/settings/rsvp-settings-form.tsx, e2e/high-contrast-theme.spec.ts, AGENTS.md, agents/capacitor.md. Not appearance-popover.tsx (lesefluss-worker's).

2026-10-28 planner: 3 reviews; gate removed by planner decision (deploy-order rule in AGENTS.md step 9); contrast fixes accepted; high-contrast + appearance/eink/highlights e2e 23/23 green. OWNER: deploy server before shipping clients (AC5).
<!-- SECTION:NOTES:END -->
