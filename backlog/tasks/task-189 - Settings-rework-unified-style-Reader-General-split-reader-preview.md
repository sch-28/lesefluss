---
id: TASK-189
title: 'Settings rework: unified style, Reader/General split, reader preview'
status: In Progress
assignee: []
created_date: '2026-10-02 21:06'
updated_date: '2026-10-02 21:16'
labels:
  - ui
  - settings
dependencies: []
modified_files:
  - apps/capacitor/src/components/settings/settings-section.tsx
  - apps/capacitor/src/components/settings/settings-row.tsx
  - apps/capacitor/src/components/settings/stepper-row.tsx
  - apps/capacitor/src/components/settings/slider-row.tsx
  - apps/capacitor/src/components/appearance-pickers.tsx
  - apps/capacitor/src/components/app-shell/toggle-row.tsx
  - apps/capacitor/src/components/rsvp-pickers.tsx
  - apps/capacitor/src/hooks/use-appearance-settings.ts
  - apps/capacitor/src/pages/settings/reader-preview.tsx
  - apps/capacitor/src/pages/settings/rsvp-settings-form.tsx
  - apps/capacitor/src/pages/settings/diagnostics-row.tsx
  - apps/capacitor/src/pages/onboarding/steps/theme.tsx
  - apps/capacitor/src/pages/reader/scroll-view.tsx
  - apps/capacitor/src/pages/reader/page-view/chunk-content.tsx
  - apps/capacitor/src/routes/tabs/settings/index.tsx
  - apps/capacitor/src/routes/tabs/settings/reader.tsx
  - apps/capacitor/src/routes/tabs/settings/general.tsx
  - apps/capacitor/src/routes/tabs/settings/appearance.tsx
  - apps/capacitor/src/routes/tabs/settings/device.tsx
  - apps/capacitor/src/routes/tabs/settings/sync.tsx
  - apps/capacitor/src/routes/tabs/settings/social.tsx
  - apps/capacitor/src/routes/tabs/settings/export.tsx
  - apps/capacitor/src/routeTree.gen.ts
  - apps/capacitor/src/theme/monochrome.css
  - apps/capacitor/e2e/auto-open-last-book.spec.ts
  - apps/capacitor/e2e/default-reader-mode.spec.ts
  - apps/capacitor/e2e/settings-reader-preview.spec.ts
priority: medium
ordinal: 135000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Settings pages are visually inconsistent and the Appearance page mixes app-wide settings (theme, app text size) with reader typography/behaviour. "Open last book on launch" floats on the landing page; "default reader mode" lives on the RSVP page though it governs all books. The RSVP page's flat style (strong section headers, steppers, mode cards, live preview) is the target look for every settings page.

Decisions: flat RSVP style everywhere incl. landing; Appearance replaced by Reader (reader typography/behaviour + live preview) and General (theme, app text size, startup: open last book + default reader mode); Device, Sync, Social and Export settings pages restyled too. Social tab screens using app-shell/section are out of scope. Partly overlaps TASK-130 (legacy ap-step-btn CSS).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All settings pages (landing, Reader, RSVP, General, Export, Device, Sync, Social) use one shared flat section/row style
- [x] #2 Reading Mode cards span the full row width
- [x] #3 Reader page shows a live preview reflecting font, size, line spacing, margins, theme and active-word underline
- [x] #4 Reader page includes glossary underline toggle
- [x] #5 General page holds theme, app text size, open last book on launch and default reader mode
- [x] #6 Old /tabs/settings/appearance route removed; landing links to Reader and General
- [x] #7 RSVP reset no longer resets default reader mode
- [ ] #8 In-reader RSVP sheet (minimal form) and onboarding theme step still work
- [x] #9 e2e specs for auto-open-last-book and default-reader-mode updated and passing; new e2e covers reader preview reacting to font size
- [ ] #10 Lint and typecheck pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Shared primitives in components/settings/ (SettingsSection, SettingsRow/RowLabel/NavRow, StepperRow, SliderRow); app-shell ToggleRow got optional id/subtitle. ThemeCards/FontCards in components/appearance-pickers.tsx (onboarding theme step reuses). readerFontStack helper in use-appearance-settings replaces duplicated serif stack in scroll-view and chunk-content. Removed .ap-settings-row/.ap-settings-val CSS. Social tab screens still on app-shell/section (out of scope). tsc: only error is pre-existing pages/reader/index.tsx:1913 (not touched). vitest 967 pass; 9 affected e2e pass (2 flaked once on cold-server import, green on rerun).

AC8: onboarding verified via e2e; in-reader RSVP sheet (minimal form) not yet manually checked. AC10: biome clean, tsc blocked only by pre-existing reader/index.tsx error.
<!-- SECTION:NOTES:END -->
