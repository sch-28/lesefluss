---
id: TASK-190
title: Fresh install overwrites synced reader settings with defaults
status: In Progress
assignee: []
created_date: '2026-10-02 21:12'
updated_date: '2026-10-02 21:18'
labels:
  - sync
  - bug
dependencies: []
modified_files:
  - apps/capacitor/src/services/db/queries/settings.ts
  - apps/capacitor/src/services/sync/index.ts
  - apps/capacitor/src/services/sync/session.ts
  - apps/web/src/routes/api/sync.ts
  - apps/capacitor/src/services/db/__tests__/settings-updated-at.test.ts
  - apps/capacitor/src/services/sync/__tests__/settings-adopt.test.ts
  - apps/capacitor/src/services/sync/__tests__/settings-sync.test.ts
priority: high
ordinal: 136000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After reinstalling and signing in, reader font size (and all synced settings) reset to defaults. Cause: fresh settings row is stamped Date.now() and every saveSettings (incl. local-only fields like onboardingCompleted) bumps updatedAt, so on first pull local wins LWW, and the following push blindly upserts defaults over the server row.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 First pull for a device/account adopts server settings unconditionally
- [x] #2 Writes touching only local-only fields do not bump settings updatedAt
- [x] #3 Adopted server settings keep the server's updatedAt
- [x] #4 Server settings upsert only overwrites when incoming updatedAt is newer
- [x] #5 Unit tests cover adopt decision and local-only write
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Per-account Preferences marker `sync_settings_adopted` (cleared with LAST_SYNCED_KEY in clearAccountScopedState). Until set: pull adopts server settings regardless of timestamps (incl. onboarding theme; user decided server wins), and push sends settings=null so install defaults never reach the server. Installs that synced before the marker existed (LAST_SYNCED_KEY present) count as adopted, so upgrades keep LWW and unpushed edits.

saveSettings stamps updatedAt only when the patch carries a SYNCED_SETTING_KEYS field; pull replays the server's updatedAt. Server upsert: setWhere excluded.updated_at > sync_settings.updated_at, incoming updatedAt clamped to now (far-future client clock would otherwise lock settings).

Accepted: slow-clock device edits lose LWW (inherent, same as series).
Reviewed by 3 agents (conventions / correctness / security), all findings fixed.
Pending: on-device verify (reinstall + sign in keeps font size); web deploy for server guard.
<!-- SECTION:NOTES:END -->
