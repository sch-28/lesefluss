---
id: TASK-125
title: Inject extension page capture only after user action
status: Done
assignee: []
created_date: '2026-05-01 22:37'
updated_date: '2026-05-01 23:26'
labels:
  - extension
  - privacy
milestone: m-9
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Switch the browser extension from automatic page-capture content-script injection on every page to user-initiated injection, so the extension only accesses page content when the user clicks the popup save button or context-menu action.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The page-capture content script is not automatically registered on all websites.
- [x] #2 The extension injects page-capture code only from a user-triggered action that has activeTab permission.
- [x] #3 Page and selection saves still work on supported web pages.
- [x] #4 Unsupported pages show a friendly capture error instead of a raw runtime failure.
- [x] #5 Extension type checking or equivalent verification passes.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reviewed current uncommitted extension changes against the requested activeTab/user-click injection goal. Fixed duplicate runtime injection by adding a ping/ready handshake before executeScript, updated deployment docs for the required scripting permission, and ignored extension zip artifacts.

Verified production extension build. Generated manifest has an empty content_scripts array, includes activeTab and scripting, and only keeps https://lesefluss.app/* as host permission. Did not run a browser smoke test in Chrome/Firefox from this environment.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The extension page-capture content script is runtime-registered and injected only for save actions. Injection is now idempotent per tab, unsupported pages keep a friendly error, docs match the scripting permission model, and extension type checking plus production build pass. Generated manifest confirms no automatic content script registration.
<!-- SECTION:FINAL_SUMMARY:END -->
