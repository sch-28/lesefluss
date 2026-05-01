---
id: TASK-122
title: Self-hosted sync server support
status: To Do
assignee: []
created_date: '2026-05-01 14:21'
labels:
  - sync
  - self-hosting
  - infrastructure
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Allow users to run their own sync backend instead of relying on lesefluss.app. The sync API already exists in `apps/web` — the goal is to make it deployable as a standalone service so privacy-conscious or technical users can own their data entirely.

## Context

Currently cloud sync is tied to lesefluss.app (auth + POST /api/sync). This is fine for most users but blocks adoption by users who won't trust a third-party server with their reading data. Self-hosting is a strong open-source differentiator (Kavita, Jellyfin, Immich all do this well).

## Scope

- Extract or document how to deploy the sync API independently (Docker image / docker-compose)
- Add a "custom sync server URL" setting in the app that replaces the hardcoded lesefluss.app base URL
- Auth needs to work against the self-hosted instance (OIDC or a simpler token approach)
- The self-hosted server should be fully functional without Kavita+ style paywalling — everything free
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 User can enter a custom sync server URL in app settings
- [ ] #2 App syncs books/settings/highlights against the custom server instead of lesefluss.app
- [ ] #3 A Docker image or docker-compose file exists to deploy the sync server
- [ ] #4 Self-hosted deployment is documented (README or wiki)
- [ ] #5 Default behavior (lesefluss.app) is unchanged when no custom URL is set
<!-- AC:END -->
