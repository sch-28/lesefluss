---
id: TASK-205.9
title: >-
  Sync: forward-compatible settings so new values never break a push or reset
  other devices
status: To Do
assignee: []
created_date: '2026-10-20 22:34'
updated_date: '2026-10-20 22:35'
labels:
  - sync
  - bug
milestone: m-13
dependencies: []
parent_task_id: TASK-205
priority: high
ordinal: 172200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in the 2026-10-21 review of TASK-205. It is a prerequisite for every new synced reader setting there: font, bold, spacing, alignment, theme, ruler.

The server safeParses the whole SyncPayloadSchema (packages/core/src/sync.ts ~260; apps/web/src/routes/api/sync.ts ~385). Settings enums are closed, for example readerFontFamily `z.enum(["sans","serif"])` ~153 and readerTheme ~147. A client that sends a new enum value to a server that hasn't been updated gets its entire push rejected with a 400. Books, highlights and reading positions then stop syncing too.

There is a second risk. Fields declared as `.optional().default(x)` (~164) let an old client push settings without the new field. The default fills in, and the server upsert (api/sync.ts ~491-507) overwrites the value a newer device set.

Clients do not validate pulled settings (SyncResponse is only a TS type, apps/capacitor/src/services/sync/index.ts ~353), so old clients receiving new values don't fail. They must still render a safe fallback.

Goal: make the settings part of sync forward-compatible once, so each TASK-205 subtask doesn't depend on deploy order.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A push containing an unknown settings enum value is accepted by the server; the rest of the payload (books, highlights, positions) is applied
- [ ] #2 A push from an older client that omits a settings field leaves the stored server value for that field unchanged
- [ ] #3 Older clients receiving an unknown font/theme value render a defined fallback (Sans / dark) without error
- [ ] #4 Unit/integration tests cover unknown-enum push, missing-field push and old-client pull
- [ ] #5 Server change is deployed before any client ships a new settings value (noted in the task when done)
<!-- AC:END -->
