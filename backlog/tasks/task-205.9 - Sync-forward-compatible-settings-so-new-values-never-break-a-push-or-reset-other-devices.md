---
id: TASK-205.9
title: >-
  Sync: forward-compatible settings so new values never break a push or reset
  other devices
status: Done
assignee: []
created_date: '2026-10-26 03:15'
updated_date: '2026-10-26 03:15'
labels:
  - sync
  - bug
milestone: m-13
dependencies: []
modified_files:
  - packages/core/src/sync.ts
  - packages/core/src/__tests__/sync-schema.test.ts
  - apps/web/src/routes/api/sync.ts
  - apps/web/src/lib/sync-settings-upsert.ts
  - apps/web/src/lib/sync-settings-upsert.integration.test.ts
  - apps/capacitor/src/contexts/theme-context.tsx
  - apps/capacitor/src/contexts/__tests__/theme-context.test.ts
  - apps/capacitor/src/hooks/use-appearance-settings.ts
  - apps/capacitor/src/hooks/__tests__/use-appearance-settings.test.ts
  - apps/capacitor/src/pages/reader/index.tsx
  - apps/capacitor/src/pages/reader/appearance-popover.tsx
parent_task_id: TASK-205
priority: high
ordinal: 172200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in the 2026-10-26 review of TASK-205. It is a prerequisite for every new synced reader setting there: font, bold, spacing, alignment, theme, ruler.

The server safeParses the whole SyncPayloadSchema (packages/core/src/sync.ts ~260; apps/web/src/routes/api/sync.ts ~385). Settings enums are closed, for example readerFontFamily `z.enum(["sans","serif"])` ~153 and readerTheme ~147. A client that sends a new enum value to a server that hasn't been updated gets its entire push rejected with a 400. Books, highlights and reading positions then stop syncing too.

There is a second risk. Fields declared as `.optional().default(x)` (~164) let an old client push settings without the new field. The default fills in, and the server upsert (api/sync.ts ~491-507) overwrites the value a newer device set.

Clients do not validate pulled settings (SyncResponse is only a TS type, apps/capacitor/src/services/sync/index.ts ~353), so old clients receiving new values don't fail. They must still render a safe fallback.

Goal: make the settings part of sync forward-compatible once, so each TASK-205 subtask doesn't depend on deploy order.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A push containing an unknown settings enum value is accepted by the server; the rest of the payload (books, highlights, positions) is applied
- [x] #2 A push from an older client that omits a settings field leaves the stored server value for that field unchanged
- [x] #3 Older clients receiving an unknown font/theme value render a defined fallback (Sans / dark) without error
- [x] #4 Unit/integration tests cover unknown-enum push, missing-field push and old-client pull
- [ ] #5 Server change is deployed before any client ships a new settings value (noted in the task when done)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Core: add SyncSettingsPushSchema (server-only lenient parse of pushed settings: every field optional, an invalid/unknown value drops just that field, no Zod defaults) and SyncPushSchema = SyncPayloadSchema.extend({ settings }). Client types (SyncPayload / SyncSettings) unchanged.
2. Web: route parses with SyncPushSchema; settings upsert moved to lib/sync-settings-upsert.ts and writes only the fields the push carried (insert falls back to column defaults, so pull still returns a full row).
3. Capacitor: normalize unknown font (readerFontFamilyFor -> sans) and extract storedThemeFor (-> dark) so this build behaves as a safe "old client" later.
4. Tests: core schema unit tests, web DB integration test for the upsert, capacitor fallback test.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Server reads pushes with `SyncPushSchema` (packages/core/src/sync.ts). Settings go through the module-private `SyncSettingsPushSchema`: `looseObject({ updatedAt })` + transform that validates each SYNCED_SETTING_KEYS field against `SyncSettingsSchema.shape[key]` and keeps only valid, present ones. Unknown keys are ignored. An invalid `updatedAt` still 400s (not a forward-compat case).
- `upsertSyncSettings` (apps/web/src/lib/sync-settings-upsert.ts) spreads only the carried fields into insert/`set`, keeping the LWW guard + clock clamp. All sync_settings columns are NOT NULL with defaults matching DEFAULT_SETTINGS, so a first partial push still yields a complete row for GET. Future settings columns must keep a NOT NULL DEFAULT for this to hold.
- Released clients already fall back safely: `readerFontStack` returns undefined (app sans) for unknown fonts, ThemeProvider maps unknown themes to dark, Settings subtitle falls back to "Sans". This build also normalizes the font (`readerFontFamilyFor`, used in useAppearanceSettings and reader index) and theme (`storedThemeFor` with an `isAppTheme` guard). The appearance popover writes the displayed value when the pressed item is tapped (`v || current`), so an unknown stored value can be replaced from there.
- HARD RULE (AC5): the server must know a new settings value before any client sends it. Otherwise the value is dropped and the devices drift: the pushing device keeps its value with local updatedAt=T, the server stores the old value with updatedAt=min(T, now), the strict `>` guard rejects every later re-push of T, and `shouldAdoptServerSettings` refuses on pull. Devices stay apart until the next settings edit on the pushing device. Deploying the server later does NOT resolve it by itself.
- Coverage is honest about scope: there is no POST /api/sync harness, so AC1 is covered at the schema level (unknown enum dropped, books in the same push kept) and the upsert level (DB integration), not end to end. AC2 covered by schema + DB integration tests, AC3 by capacitor unit tests for font/theme fallback.
- `SyncSettingsSchema` keeps its `.optional().default(true)` on two booleans; it no longer runs on the server path.
- Test fixtures use `satisfies SyncSettings`, so adding a synced setting breaks compilation until fixtures are updated. Kept as two fixtures (core unit, web integration): no shared test-fixture module exists across packages.
- Verified (after review fixes): tsc (core, web, capacitor) clean; biome clean on touched files (3 pre-existing infos in reader/index.tsx); vitest core 191/191, web 315/315 (with DATABASE_URL, integration tests ran), capacitor 1277/1277.
- AC5 is for the owner.

2026-10-26 lese-planner: reviewed by 3 agents (server correctness: clean; compat/client: drift note + popover re-select fixed; conventions: export/cast/fixture/test layout fixed). tsc, biome, vitest core 191 / web 315 (with DB) / capacitor 1277 green. AC5 stays open for the owner: deploy the server before any client ships a new settings value.
<!-- SECTION:NOTES:END -->
