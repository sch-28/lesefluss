---
id: TASK-121.5
title: 'iOS PWA: real iPhone test pass and fixes'
status: To Do
assignee: []
created_date: '2026-10-20 21:58'
updated_date: '2026-10-20 22:06'
labels:
  - pwa
  - ios
  - web
  - qa
milestone: m-14
dependencies:
  - TASK-121.1
  - TASK-121.2
  - TASK-121.3
  - TASK-121.6
  - TASK-203
parent_task_id: TASK-121
priority: medium
ordinal: 170000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Our web tests run in desktop browsers via Playwright, which misses iOS-specific behaviour. Install the PWA on a real iPhone (iOS 16.4 or newer, ideally also the current iOS 26) and walk through the app, fixing what breaks.

Known iOS Safari trouble spots to check:
- Long-press text selection and the iOS callout menu fighting the reader's selection toolbar and highlights; images in long-press gestures (`draggable={false}` lesson from Android WebView).
- Page mode tap zones and swipes; there is no system back-swipe in standalone mode, so every screen needs an in-app way back.
- The on-screen keyboard resizing the viewport (scroll reader position jumps were a past bug class) and inputs zooming the page when their font size is under 16px.
- vaul drawers and snap points against the iOS dynamic viewport and the home indicator.
- Rubber-band overscroll on the reader and pull-down on lists.
- EPUB import through the Files picker, including large illustrated books; "Paste text" import with the iOS paste permission callout.
- Memory: a large illustrated book and a library of 100+ books without the page reloading (iOS kills the web process on memory pressure, which looks like a sudden reload).
- Screen wake lock during RSVP (`pages/reader/use-wake-lock.ts`): broken in home-screen apps before iOS 18.4 (https://bugs.webkit.org/show_bug.cgi?id=254545); confirm on 18.4+ and that older versions degrade quietly.
- Offline cold start of the installed app.
- Update after a deploy while an old shell is installed.
- Sign-in round trip in standalone mode.
- Safari tab → Add to Home Screen walkthrough on iOS 26's default flow.
- Buddy-read live board and social while foregrounded.

TASK-204 is not a prerequisite; if it lands, re-check image-heavy books.

Record what was tested, on which device and iOS version, in the task notes. Fix small issues here; file anything large as its own task under TASK-121.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The device, iOS version and checklist results are recorded in the task notes
- [ ] #2 Reading in scroll, page and RSVP mode works in standalone mode, including selection, highlights, the dictionary drawer and wake lock on iOS 18.4+
- [ ] #3 Sign-in, sync and social work in standalone mode without leaving the app
- [ ] #4 A large illustrated EPUB imports and reads without the app reloading
- [ ] #5 Offline cold start and update-after-deploy work on the installed app
- [ ] #6 No UI sits under the status bar or home indicator and every screen can be left without a system back gesture
- [ ] #7 Issues too big to fix here have their own tasks under TASK-121
<!-- AC:END -->
