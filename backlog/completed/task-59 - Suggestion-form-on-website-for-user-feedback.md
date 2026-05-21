---
id: TASK-59
title: Suggestion form on website for user feedback
status: Done
assignee:
  - OpenCode
created_date: '2026-04-26 15:59'
updated_date: '2026-04-30 19:52'
labels: []
milestone: m-6
dependencies: []
ordinal: 1000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 /feedback exists as a public website route.
- [x] #2 Feedback form sends submissions to feedback@lesefluss.app.
- [x] #3 Form supports feedback type, message, optional email, and source context.
- [x] #4 Basic spam protection exists via honeypot and rate limiting.
- [x] #5 Website footer links to /feedback.
- [x] #6 App Settings includes a non-intrusive Send feedback option.
- [x] #7 App feedback option opens the website feedback page without interrupting app state.
- [x] #8 Relevant website and app checks pass or any failures are documented.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Implement Option 2: a public website feedback page plus a non-intrusive app Settings link. Add a TanStack Start API route at apps/web/src/routes/api/feedback.ts that validates feedback type/message/optional email/source, rejects honeypot submissions, rate-limits by forwarded IP, escapes submitted content, and emails feedback@lesefluss.app via the existing sendMail() helper. Add apps/web/src/routes/feedback/index.tsx with SEO metadata and a simple form that posts to /api/feedback, shows success/error states, includes a hidden honeypot field, and provides a mailto fallback. Add a footer Resources link to /feedback. Add a Settings item in apps/capacitor/src/pages/settings.tsx that opens https://lesefluss.app/feedback?source=app on native and /feedback?source=web-app in a new tab on web, without prompting. Update area docs (agents/web.md and agents/capacitor.md) to keep route/settings structure current. Verify with relevant type checks/biome where practical.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented feedback@lesefluss.app endpoint/page and app Settings link. Review pass also fixed related uncommitted issues found in the requested dirty-diff scope: added feedback body/global/IP limits, restricted catalog article POST proxy to ScribbleHub AJAX shape with request/body caps, handled native WebView main-frame errors, preserved text/markdown shares without streams, made highlight export safer for legacy null text and share/download races, and prevented reader keyboard shortcuts through interactive UI.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a public /feedback website page and /api/feedback endpoint that emails feedback@lesefluss.app with validation, honeypot, request-size guard, and rate limiting. Added a footer Feedback link, sitemap entry, app Settings Send feedback link, and updated area docs. Review fixes across the dirty diff also hardened related proxy/native/export/keyboard behavior. Verification: targeted Biome check passed; pnpm --filter @lesefluss/web check-types passed; pnpm --filter lesefluss check-types passed.
<!-- SECTION:FINAL_SUMMARY:END -->
