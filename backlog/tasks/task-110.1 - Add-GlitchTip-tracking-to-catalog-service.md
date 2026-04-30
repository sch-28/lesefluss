---
id: TASK-110.1
title: Add GlitchTip tracking to catalog service
status: Done
assignee: []
created_date: '2026-04-26 13:46'
updated_date: '2026-04-26 14:01'
labels:
  - observability
  - privacy
  - catalog
dependencies: []
references:
  - apps/catalog
  - agents/catalog.md
documentation:
  - 'https://docs.sentry.io/platforms/javascript/guides/hono/'
parent_task_id: TASK-110
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Integrate the catalog Hono service with the self-hosted GlitchTip instance using Sentry-compatible Node SDKs. Cover request handler errors, fatal startup failures, and background catalog sync failures. Keep the integration privacy-first and env-gated: no hardcoded DSN, no cookies, no replay, no default PII, no profiling/tracing unless explicitly enabled later.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Current GlitchTip/Sentry-compatible Hono or Node documentation is checked before implementation, and any important caveats are noted in the task.
- [x] #2 Catalog initializes error tracking only when a GlitchTip/Sentry DSN env var is configured.
- [x] #3 Unhandled Hono request errors are reported while normal 4xx responses are not treated as application errors.
- [x] #4 Background sync failures in the orchestrator are reported with source/phase context but without secrets or full upstream payloads.
- [x] #5 Fatal startup errors are reported before process exit when possible.
- [x] #6 Privacy defaults disable default PII and tracing/profiling/replay-style features.
- [x] #7 Catalog type check/build passes after the integration.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add @sentry/node to apps/catalog dependencies.
2. Add a catalog-local error tracking module that initializes only when SENTRY_DSN is configured, with sendDefaultPii false, tracing/logging/profiling disabled, and conservative scrubbing.
3. Wire app.onError for uncaught Hono route errors without reporting expected 4xx responses.
4. Capture background sync failures with safe source/phase counters only.
5. Capture fatal startup errors and flush before process exit.
6. Run catalog type check/build and record results.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation completed for catalog only. Documentation checked before implementation: Sentry Hono guide recommends @sentry/node for Node-based Hono and notes @hono/sentry is deprecated; Sentry Node options confirm SENTRY_DSN/SENTRY_ENVIRONMENT/SENTRY_RELEASE env handling, sendDefaultPii default false, and tracesSampleRate behavior; Hono docs confirm app.onError handles uncaught request errors.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added privacy-first GlitchTip/Sentry-compatible error tracking to apps/catalog. New apps/catalog/src/lib/error-tracking.ts initializes @sentry/node only when SENTRY_DSN is configured, sets sendDefaultPii=false, disables tracing/logging propagation, strips request headers/cookies/query strings, and exposes capture/flush helpers. Wired Hono app.onError for uncaught 500s, catalog sync orchestrator failures with safe source/phase counters, and fatal startup errors with flush before exit. Verified with pnpm --filter @lesefluss/catalog check-types and pnpm --filter @lesefluss/catalog build.
<!-- SECTION:FINAL_SUMMARY:END -->
