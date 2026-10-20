---
id: TASK-121.4
title: 'iOS PWA: guide Safari visitors to add /app/ to the Home Screen'
status: To Do
assignee: []
created_date: '2026-10-20 21:58'
updated_date: '2026-10-20 22:06'
labels:
  - pwa
  - ios
  - web
  - ux
milestone: m-14
dependencies: []
parent_task_id: TASK-121
priority: low
ordinal: 169000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
iOS has no install prompt (`beforeinstallprompt` does not exist in Safari), so users only get the standalone app if they find Share → Add to Home Screen themselves. Running in a Safari tab is worse for us: storage written in a Safari tab can be evicted after 7 days without use, and it is not shared with the installed home-screen app, so a library built in a tab does not carry over after installing.

With iOS 26, "Open as Web App" is on by default, so users may add the landing page instead of `/app/`. The guide must get them to add `/app/` (coordinate with the `/site.webmanifest` decision in TASK-121.1).

## Scope
- In `/app/`: iOS Safari visitors not in standalone mode see a short, dismissible guide with the Share → Add to Home Screen steps, and a note that local data in the tab does not move to the installed app unless they sign in to sync.
- On the website: `apps/web/src/routes/download/index.tsx` is Android/Play-only today; add an iPhone section pointing to the web app install path. Check the `/app` call-to-actions in `components/header.tsx`, `routes/index.tsx` and `explore-wall.tsx` so iPhone visitors land on `/app/` with the guide.
- English only, matching other app copy: the app has no i18n.

Must not show in standalone mode, on Android, on desktop, or in the native app.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 iOS Safari visitors of /app/ outside standalone mode see a dismissible Add to Home Screen guide; dismissal is remembered
- [ ] #2 The guide says local data in the Safari tab does not move to the installed app and recommends signing in to sync
- [ ] #3 Following the guide on iOS 26 installs /app/, not the landing page
- [ ] #4 The guide never shows in standalone mode, on Android, on desktop browsers or in the native app
- [ ] #5 The website download page has an iPhone section and the /app call-to-actions lead iPhone users to the guide
- [ ] #6 pnpm e2e:app covers show and hide with an iOS user agent
- [ ] #7 The download page's iPhone section lists what the web app cannot do (no rsvpnano device, no background read-aloud, no reminders or notifications)
<!-- AC:END -->
