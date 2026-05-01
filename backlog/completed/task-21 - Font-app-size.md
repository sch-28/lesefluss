---
id: TASK-21
title: Font app size
status: Done
assignee: []
created_date: '2026-04-26 13:53'
updated_date: '2026-04-26 17:28'
labels: []
milestone: m-2
dependencies: []
ordinal: 12000
---

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a user-controlled `appFontSize` setting (12–22 px, default 16, step 1) that drives the Capacitor app's root `font-size` for app-wide rem scaling. Local-only (per device, not synced and not pushed to ESP32).

**Changes**
- `packages/core/src/settings.ts`: `APP_FONT_SIZE` added to `DEFAULT_SETTINGS` + `SETTING_CONSTRAINTS`. Not added to `SYNCED_SETTING_KEYS`/`ESP32_SETTING_KEYS`.
- `apps/capacitor/src/services/db/schema.ts`: `appFontSize` column (default 16).
- `apps/capacitor/drizzle/0013_app_font_size.sql` + `meta/_journal.json`: migration registered.
- `apps/capacitor/src/services/db/queries/settings.ts`: first-run seed includes the field.
- `apps/capacitor/src/theme/variables.css`: root bumped 14px → 16px (matches new default; runtime JS overrides once settings load).
- `apps/capacitor/src/contexts/theme-context.tsx`: theme + appFontSize applied via single `useEffect` calling `applyAppearance()`.
- `apps/capacitor/src/hooks/use-appearance-settings.ts`: exposes `appFontSize` + `adjustAppFontSize`.
- `apps/capacitor/src/pages/settings/appearance.tsx`: "App text size" stepper added under the Font section.

**Docs**
- `agents/capacitor.md`: corrected the stale "single clean migration" note to describe the real incremental SQL + journal flow.
<!-- SECTION:FINAL_SUMMARY:END -->
