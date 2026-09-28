---
id: TASK-171.16
title: Verify App Links on a Play-signed build against lesefluss.app
status: To Do
assignee: []
created_date: '2026-09-28 16:17'
labels:
  - social
  - app
  - release
dependencies:
  - TASK-171.3
parent_task_id: TASK-171
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Split out of TASK-171.3, whose two App Links acceptance criteria were never verified against production.

- The phone deep-link test in TASK-171.3 ran against `localhost` through `adb reverse`, not `https://lesefluss.app`.
- `assetlinks.json` gets its Play fingerprint only from the `PLAY_APP_SIGNING_SHA256` environment variable, so Android App Links verification for the Play-signed build cannot be checked until that variable is set in production.

This task is the verification on a real release. It needs the owner: the Play Console app-signing SHA-256, the production deploy, and an installed release build.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Tapping an https://lesefluss.app/invite/<token> link on Android with the app installed opens the invite confirmation screen, from both a cold start and a running app
- [ ] #2 assetlinks.json is served from https://lesefluss.app/.well-known/assetlinks.json as application/json and Android App Links verification passes for both the Play-signed and the locally signed release build
- [ ] #3 PLAY_APP_SIGNING_SHA256 is set in the production environment, and `adb shell pm get-app-links app.lesefluss` shows lesefluss.app as verified on the Play-signed install
<!-- AC:END -->
