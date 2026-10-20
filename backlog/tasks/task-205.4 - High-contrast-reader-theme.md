---
id: TASK-205.4
title: High-contrast reader theme
status: To Do
assignee: []
created_date: '2026-10-20 22:23'
updated_date: '2026-10-20 22:35'
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
- [ ] #1 New high-contrast theme selectable alongside Dark/Sepia/Light
- [ ] #2 Body text and reader chrome meet WCAG AAA (7:1) contrast
- [ ] #3 All four highlight colors, glossary underline, links, active-word underline, spoken-word mark and RSVP focal letter remain visible and distinguishable
- [ ] #4 Tailwind dark: variants, stats charts and line-art image inversion treat high-contrast as a dark theme; EPUB images remain viewable
- [ ] #5 SyncSettingsSchema accepts the new value and the server change is deployed before clients send it; old clients render it as dark without error; a sync push containing it never fails on an up-to-date server
- [ ] #6 Theme changes colors only (no font-weight/size/spacing change); switching theme mid-chapter keeps the same first visible word in scroll and page mode and does not save a new position
- [ ] #7 pnpm build and Android build succeed; Playwright e2e covers switching to high-contrast mid-chapter without position change in scroll and page mode; existing appearance-persist, page-mode-appearance-anchor and position-* e2e specs pass
<!-- AC:END -->
