---
id: TASK-110.2
title: Add GlitchTip tracking to website browser and server
status: Done
assignee: []
created_date: '2026-04-26 13:46'
updated_date: '2026-04-26 14:58'
labels:
  - observability
  - privacy
  - web
dependencies: []
references:
  - apps/web
  - agents/web.md
documentation:
  - 'https://docs.sentry.io/platforms/javascript/guides/tanstackstart-react/'
parent_task_id: TASK-110
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Integrate the TanStack Start website with the self-hosted GlitchTip instance using Sentry-compatible SDKs. Cover browser React/router errors and TanStack Start server/API/SSR errors where supported. Keep the integration privacy-first and env-gated: no hardcoded DSN, no cookies, no replay, no default PII, no unnecessary tracing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Current GlitchTip/Sentry-compatible TanStack Start documentation and known compatibility caveats are checked before implementation, especially because the TanStack Start SDK is marked alpha.
- [x] #2 Website browser error tracking initializes only when a public GlitchTip/Sentry DSN env var is configured.
- [x] #3 The existing TanStack Router error boundary reports caught route/render errors manually.
- [x] #4 Website server-side errors are reported when a server DSN is configured, using the least invasive integration that fits the current Nitro/TanStack Start deployment.
- [x] #5 No DSN or secret is hardcoded; client-exposed env vars are intentionally public DSNs only.
- [x] #6 Privacy defaults disable default PII, replay, and tracing unless explicitly enabled later.
- [x] #7 Website type check/build passes after the integration.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add @sentry/tanstackstart-react to apps/web.
2. Add a browser helper that initializes only when VITE_SENTRY_DSN is present and uses privacy-first defaults.
3. Update router.tsx to initialize browser error tracking after router creation.
4. Update DefaultCatchBoundary to manually capture caught route/render errors.
5. Add a server instrumentation file loaded with node --import in the production entrypoint, initialized only when SENTRY_DSN is present.
6. Copy the server instrumentation file into .output/server during Docker build.
7. Add the GlitchTip DSN origin to CSP connect-src when configured.
8. Run web typecheck/build and targeted Biome checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation research checked GlitchTip error tracking/SDK docs, Sentry TanStack Start React docs, Sentry JS options, and TanStack Start server entry point docs. Important caveat: @sentry/tanstackstart-react is marked alpha, so implementation avoids source-map upload, replay, tracing, and request middleware for now. During review, an initial --import server bootstrap was replaced with a bundled src/server.ts entry point to avoid production Docker startup failures from an unbundled instrumentation import.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added self-hosted GlitchTip/Sentry-compatible tracking for apps/web. Browser tracking initializes from VITE_SENTRY_DSN in router.tsx with privacy-first defaults, and DefaultCatchBoundary manually reports caught route/render errors. Server tracking initializes from SENTRY_DSN through a bundled TanStack Start src/server.ts entry point and a server-only helper, avoiding an external runtime --import file. CSP connect-src now allows the configured GlitchTip DSN origin. Verification passed: pnpm --filter @lesefluss/web check-types, pnpm --filter @lesefluss/web build, and targeted Biome checks for touched web files.
<!-- SECTION:FINAL_SUMMARY:END -->
