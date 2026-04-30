---
id: TASK-108
title: 'Catalog proxy: unblock Cloudflare-protected providers on web'
status: To Do
assignee: []
created_date: '2026-04-29 20:14'
updated_date: '2026-04-30 21:49'
labels:
  - catalog
  - web
  - scraping
milestone: m-4
dependencies: []
references:
  - apps/catalog/src/routes/proxy.ts
  - apps/capacitor/src/services/serial-scrapers/fetch.ts
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The catalog server runs on a datacenter IP (Hetzner/VPS). ScribbleHub and AO3 sit behind Cloudflare, which blocks datacenter ASNs on the first request with a 403 — regardless of scrape volume. The native app is unaffected because CapacitorHttp uses the user's residential IP.

Current workaround: web users see "Chapter not available in the web app — open it in the mobile app." (added alongside this ticket). That's acceptable short-term but blocks web-only users from reading any Cloudflare-protected serial.

## Options

1. **Residential proxy service** (Webshare, Oxylabs, Bright Data) — route catalog upstream fetches for web-novel providers through a residential exit node. Adds ~50–200 ms latency and ongoing cost (~$5–15/mo for low volume). Most reliable fix.

2. **Per-provider User-Agent rotation + header spoofing** — unlikely to help; Cloudflare blocks by ASN, not UA string.

3. **Puppeteer/browser rendering on the server** — heavy, but bypasses JS challenges. Overkill for HTML scraping.

4. **Offload chapter fetching to the client** — skip the catalog proxy entirely and fetch chapters directly from the browser. Requires CORS headers from ScribbleHub/AO3 (they don't have them), so not viable without a CORS proxy.

Recommended: start with option 1 (residential proxy). Scope is limited to the `fetchUpstream` call in `apps/catalog/src/routes/proxy.ts` — add a `RESIDENTIAL_PROXY_URL` env var and route requests through it only for providers on a known-Cloudflare list.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ScribbleHub and AO3 chapter fetches succeed from the web build via the catalog proxy
- [ ] #2 Residential proxy URL is configurable via env var with no-proxy fallback for dev
- [ ] #3 Native app path is unchanged
<!-- AC:END -->
