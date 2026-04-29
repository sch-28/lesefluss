---
id: TASK-109
title: >-
  Investigate AO3 popular/search timeout: fails at 15s but succeeds immediately
  on retry
status: To Do
assignee: []
created_date: '2026-04-29 22:29'
labels:
  - android
  - ao3
  - performance
dependencies: []
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
AO3 requests frequently time out after the full 15s timeout window, but a manual retry succeeds instantly. This suggests the first request is not actually reaching AO3 (or is hanging before sending), not that AO3 is slow to respond.

Hypotheses to investigate:
- The 2s throttle inside the promise eats into the timeout window but shouldn't cause a 15s hang
- OkHttp connection pool may be holding a stale connection that hangs on reuse; retry opens a fresh one
- Cloudflare may be silently dropping the first connection (reset without RST) and the retry lands on a different edge node
- DNS resolution on first request after idle may be slow or timing out on certain networks

Things to check:
- Add OkHttp event logging (EventListener) to see where time is spent: DNS, connect, TLS, send, response
- Check whether setting `.retryOnConnectionFailure(false)` on the OkHttpClient changes behavior
- Check whether a dedicated per-request timeout vs the global client timeout makes a difference
- Verify the throttle delay isn't compounding with a slow DNS lookup to hit the 15s wall
<!-- SECTION:DESCRIPTION:END -->
