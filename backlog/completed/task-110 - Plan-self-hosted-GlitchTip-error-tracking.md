---
id: TASK-110
title: Plan self-hosted GlitchTip error tracking
status: Done
assignee: []
created_date: '2026-04-26 13:42'
updated_date: '2026-04-26 13:46'
labels:
  - observability
  - privacy
  - web
  - catalog
dependencies: []
references:
  - apps/web
  - apps/catalog
  - agents/web.md
  - agents/catalog.md
documentation:
  - 'https://docs.sentry.io/platforms/javascript/guides/hono/'
  - 'https://docs.sentry.io/platforms/javascript/guides/tanstackstart-react/'
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Umbrella task for adding privacy-first error tracking through the self-hosted GlitchTip instance. Implementation is split into separate catalog and website subtasks so each runtime can be researched and integrated independently. Keep all integrations env-gated, without hardcoded DSNs, cookies, replay, default PII, or unnecessary tracing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Catalog implementation is tracked in a dedicated subtask.
- [x] #2 Website browser/server implementation is tracked in a dedicated subtask.
- [x] #3 Both subtasks include explicit documentation/research checks before implementation.
- [x] #4 Privacy-first constraints are preserved across both subtasks.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Research notes so far: GlitchTip presents Sentry-compatible setup instructions and DSNs, so the npm SDK names remain @sentry/* while events go to the self-hosted GlitchTip endpoint. Sentry's Hono guide recommends @sentry/node for Node-based Hono and notes @hono/sentry is deprecated. Sentry's TanStack Start React guide exists but is marked ALPHA for TanStack Start 1.0 RC; it recommends @sentry/tanstackstart-react, router/browser init, server instrumentation, and optional middleware/server-entry wrapping. Privacy defaults for this project should disable default PII, replay, and tracing unless explicitly enabled later.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Split the GlitchTip integration into two implementation subtasks: TASK-110.1 for the catalog Hono service and TASK-110.2 for the TanStack Start website browser/server runtime. Added research/documentation checks and privacy-first constraints to both subtasks. Initial research confirmed GlitchTip uses Sentry-compatible DSNs/SDKs; Sentry's Hono guide recommends @sentry/node, while TanStack Start support exists but is marked alpha.
<!-- SECTION:FINAL_SUMMARY:END -->
