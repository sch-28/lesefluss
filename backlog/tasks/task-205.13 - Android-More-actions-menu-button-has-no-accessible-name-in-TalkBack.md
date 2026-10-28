---
id: TASK-205.13
title: 'Android: ''More actions'' menu button has no accessible name in TalkBack'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-28 22:04'
updated_date: '2026-10-28 22:19'
labels: []
milestone: m-13
dependencies: []
parent_task_id: TASK-205
priority: medium
ordinal: 197000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in the TASK-205.6 device pass. In the reader header, the Radix DropdownMenu trigger 'More actions' (aria-label set, aria-haspopup=menu) shows in the Android accessibility tree as android.widget.Button with an empty content-desc (uiautomator NAF=true). Chromium probably maps aria-haspopup=menu buttons to a popup-button role and exposes its (empty) value instead of the name on Android. It's the only aria-haspopup button in the app, and it's the TalkBack path to Appearance. The e2e audit (DOM snapshot) can't catch this.
AC: on device, uiautomator dump shows content-desc or text 'More actions' for the trigger, with TalkBack on, and the menu still opens and announces its items.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 On device, uiautomator dump with TalkBack on shows the reader's More actions trigger named 'More actions'
- [x] #2 The menu still opens with a normal tap and its items are exposed with their names
- [x] #3 An e2e guard reports menu buttons whose name is only an aria-label
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause, confirmed on the Pixel 8 Pro (2026-10-28). Probe buttons were injected into the live WebView over CDP (no app state touched) and read through uiautomator with TalkBack on:
- aria-haspopup=menu or true + aria-label, icon only: Button with empty text and content-desc (the bug).
- No aria-haspopup + aria-label: content-desc set.
- aria-haspopup=menu + visually hidden text: text set.
- aria-haspopup=dialog (Radix Popover) + aria-label: content-desc set.
- aria-haspopup=menu with visible text (Explore filter trigger): text set.
- role=combobox (Radix Select): Spinner, text = value.
So on Android, Chromium exposes a menu popup button by its own text and drops its aria-label. Popover and Select triggers are unaffected.

Fix: the reader's More actions trigger keeps aria-haspopup=menu and gets its name as an sr-only span instead of aria-label. The accessible name on desktop is unchanged ('More actions', name from content). It is the only icon-only menu trigger; Explore's filter trigger has visible text.

Verified on device after installing (pnpm run sync + cap run; no uninstall or clear): the trigger is Button text='More actions', no NAF. A normal tap opens the menu (Search, Appearance, Listen settings, Open on website, View book), and with TalkBack on the items are android.view.MenuItem with their names. While the menu is open, the full-screen #root View shows NAF (clickable from React's delegated listeners, not focusable, the rest hidden by Radix); TalkBack does not stop on it, so it is benign, as in the e2e audit. TalkBack was switched off after every dump (trap in the dump script); the phone was left on the library. TalkBack's training activity is still in its own background task from the dumps.

Guard: e2e/helpers/a11y-audit.ts now reports elements with aria-haspopup menu or true and no text content ('menu button with no text, unnamed on Android'). Desktop Chrome's tree names such a button, so only this DOM rule, derived from the device result, can catch it. a11y-labels.spec has a control case (an icon-only aria-label menu button is reported; one with sr-only text is not) and covers the reader. a11y-labels 3/3 green (port 3611). tsc app + e2e clean; biome clean on touched files.

Follow-up (2026-10-28): the layout checker (e2e/helpers/layout-check.ts) counted the trigger's sr-only span as visible text (spill/off-screen/clipped). It now skips text inside a box of 1px or less that clips its overflow (overflow, clip or clip-path), which is how sr-only renders. Control cases: sr-only text inside a narrow button is not reported, while a 30px overflow-hidden box that still shows part of its text is still reported as clipped. In the same run the book page's 'Open reader' button spilled at 200%: DetailShell's hero (cover + column, shared by the library and catalog book pages) now wraps like the Explore hero (column flex 1 1 10rem, title break-words); 1x on 360px stays side by side. large-text-layout + a11y-labels: 10/10 on port 3611.

Planner verification: 37/37 across a11y-labels, large-text-layout, explore-browse, explore-book-detail, import-catalog(-404), dictionary, reading-goal and reader-modes (port 3477). Device verified by worker 1 on the Pixel (uiautomator: Button text='More actions', no NAF).
<!-- SECTION:NOTES:END -->
