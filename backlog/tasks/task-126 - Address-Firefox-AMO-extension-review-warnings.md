---
id: TASK-126
title: Address Firefox AMO extension review warnings
status: Done
assignee: []
created_date: '2026-05-01 23:07'
updated_date: '2026-05-01 23:11'
labels:
  - extension
  - firefox
  - security
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reduce avoidable Firefox AMO validation warnings for the browser extension and document any remaining warnings that originate from bundled framework or library code, so reviewers can understand why they are safe.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Avoidable dynamic HTML warnings in application-owned extension code are removed or replaced with safer alternatives.
- [x] #2 Remaining AMO warnings are documented in reviewer notes with their source and safety rationale.
- [x] #3 Firefox extension build still succeeds.
- [x] #4 Extension type checking or equivalent verification passes.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Removed the background Function/eval warning without duplicating auth handoff logic by adding @lesefluss/core/auth-handoff as a package export and importing that subpath from the extension. Avoided app-owned innerHTML/outerHTML serialization in page capture by using XMLSerializer and a Readability serializer override. Remaining generated innerHTML references are from bundled @mozilla/readability and React DOM internals and are documented in AMO reviewer notes.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Firefox AMO warnings were reduced to bundled-library innerHTML references only. The extension background no longer bundles the core index/Zod path that triggered Function constructor detection, app-owned page capture serialization uses XMLSerializer, reviewer notes explain the remaining Readability/React warnings, and extension/core checks pass.
<!-- SECTION:FINAL_SUMMARY:END -->
