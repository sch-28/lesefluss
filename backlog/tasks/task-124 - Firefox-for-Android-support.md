---
id: TASK-124
title: Firefox for Android support
status: To Do
assignee: []
created_date: '2026-05-01 18:52'
labels: []
milestone: m-9
dependencies: []
ordinal: 2200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Verify and enable Firefox-for-Android compatibility for the Lesefluss browser extension. Currently the AMO listing is marked desktop-only because the mobile flow has not been tested.

Concerns to validate before flipping the AMO compatibility flag:

- `browser.contextMenus` with `contexts: ["selection"]` is unreliable on Fenix; the text-selection toolbar does not surface extension entries in all releases. If broken, document the limitation or hide the menu on mobile.
- `browser.identity.launchWebAuthFlow` works on recent Firefox-for-Android but has had quirks; smoke-test sign-in.
- The popup is 380px wide and not touch-tuned. Decide whether to leave as-is or tune for mobile widths.

Workflow:

1. Install Firefox Nightly on a test device.
2. Enable USB debugging on the device and Remote-debugging-via-USB in Firefox Nightly settings.
3. Run `web-ext run --target=firefox-android --android-device=<id> --firefox-apk=org.mozilla.fenix --source-dir=.output/firefox-mv3` from `apps/extension`.
4. Run through the README smoke checklist on the phone.
5. If everything works, set `applications.gecko.strict_min_version` and the AMO compatibility checkbox accordingly on the next release.

Out of scope: a separate mobile UI; this task is about validating the existing UI works on Android, not redesigning it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Sign-in via launchWebAuthFlow works end-to-end on Firefox for Android (Nightly)
- [ ] #2 Save current page works on Firefox for Android
- [ ] #3 Selection capture path is either confirmed working or explicitly disabled on mobile with a clear UX fallback
- [ ] #4 AMO listing flipped to compatible with Firefox for Android on a future release
- [ ] #5 README smoke checklist updated with mobile steps
<!-- AC:END -->
