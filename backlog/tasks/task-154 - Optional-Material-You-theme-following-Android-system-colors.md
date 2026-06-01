---
id: TASK-154
title: 'Optional: Material You theme following Android system colors'
status: To Do
assignee: []
created_date: '2026-05-31 21:40'
labels:
  - theme
  - android
  - ux
  - optional
dependencies: []
references:
  - packages/ui/src/styles/tokens.css
  - apps/capacitor/src/contexts/theme-context.tsx
  - apps/capacitor/android/app/src/main/res/values/colors.xml
priority: low
ordinal: 58000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Optional / nice-to-have. The app ships 3 hardcoded themes (dark, sepia, light) via CSS variables (`packages/ui/src/styles/tokens.css`, `apps/capacitor/src/contexts/theme-context.tsx`). There is no Material You / dynamic color support: Android resources only define a splash background, no `values-v31/colors.xml`, no dynamic color extraction API.

Goal: add an opt-in theme option that derives palette from Android system dynamic colors (Material You, API 31+) when available, falling back to existing themes on unsupported devices and on the web build.

User value: native Android look that matches the user's wallpaper/system accent. Addresses reviewer feedback requesting a Material-like theme following system colors. Marked optional/low priority — only worth doing if Android polish is a priority.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 New opt-in theme option in the theme switcher that uses Android dynamic colors when available (API 31+)
- [ ] #2 Graceful fallback to an existing theme on devices without dynamic color support and on the web build
- [ ] #3 Dynamic palette maps to existing CSS variable tokens so reader and UI render correctly
- [ ] #4 Selected theme persists across restarts like existing themes (localStorage + DB settings)
- [ ] #5 Verified on an API 31+ Android device and on a pre-31 device or web (fallback path)
<!-- AC:END -->
