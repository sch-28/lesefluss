---
id: TASK-171.3
title: Social tab in the app and HTTPS deep links for invite links
status: Done
assignee:
  - claude
created_date: '2026-09-25 22:10'
updated_date: '2026-09-26 15:02'
labels:
  - social
  - app
milestone: m-6
dependencies:
  - TASK-171.1
  - TASK-171.2
documentation:
  - backlog/decisions/ADR-0004-friends-only-book-sharing.md
parent_task_id: TASK-171
priority: high
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The app-side home for social features, and the plumbing that lets an invite link sent over WhatsApp open the right screen in the app.

Depends on TASK-171.1 (handle, profile, settings APIs) and TASK-171.2 (friend graph and invite APIs, plus the website page for `/invite/<token>`). The friend-graph rules (silent decline, invisible block, invite confirmation, limits) are defined server-side in TASK-171.2; this task must present them faithfully and never reveal more than the API does.

Scope:
- **Social tab**: a new top-level tab in `apps/capacitor`. Route files under `src/routes/tabs/social/` are thin wrappers (like `routes/tabs/library/index.tsx`) around page components in `src/pages/social/`. Add the entry to `NAV_ITEMS` and widen the `NavTarget["to"]` union in `src/components/app-shell/nav-items.ts`; `TabBar.tsx` and `DesktopSidebar.tsx` render from that list. Works on native and the web build (`IS_WEB_BUILD` in `src/services/sync/index.ts`; the web build runs under router basepath `/app`, see `src/router.tsx`).
  - Signed-out state: explains social features and offers sign-in. Reuse the existing flows: on native `beginAuthLoginHandoff()` + `Browser.open(${SYNC_URL}/auth/mobile-callback?state=…)` as in `src/pages/onboarding/steps/sync.tsx` / `routes/tabs/settings/sync.tsx`; on the web build a redirect to `/login?redirect=<current /app path>` (the website's `isSafeRedirect` in `apps/web/src/routes/login/index.tsx` accepts `/app/...`).
  - No-handle state: pick-a-handle step (TASK-171.1 API), after which the user lands where they were going (Social tab, or the invite confirmation if they came from a link).
  - Friends list, incoming and outgoing requests with accept/decline/cancel, "decline and block" on an incoming request, remove friend, block/unblock (in an overflow menu, with confirmation), and a "Blocked users" list visible only to the user. Outgoing requests come from the in-app request to a buddy-read co-participant (TASK-171.8); there is no handle search, directory or suggestion list.
  - Add friend: the entry point is the personal invite link. The user can create, copy, share and revoke it (`@capacitor/share` on native, `@capacitor/clipboard` or `navigator.clipboard` on web; both plugins are already dependencies), and can paste an invite link they received, which goes through the same parser as deep links and opens the invite confirmation screen.
  - Placeholders/sections that later subtasks fill: inbox badge, activity feed, buddy reads.
- **What the UI shows about people**: only the handle, display name and avatar the API returns; never the session's `user.name`, `user.image` or email. Outgoing requests show "Pending" until the API stops returning them; there is no "declined" state, because TASK-171.2 makes decline indistinguishable from pending. Remove and block confirmations say the other side is not notified.
- **Invite link UX**: the create/share screen states that anyone who has the link can become the user's friend until it expires or is revoked, shows the expiry date (14 days, TASK-171.2), and offers revoke with confirmation. Creating a new link warns that the old one stops working.
- **Empty, loading and error states**: no friends yet (points to creating and sharing the invite link), no requests, a pasted text that is not a valid invite link (inline hint, no request sent), loading, offline, and API errors from TASK-171.2 mapped to clear messages: rate limit exceeded ("Try again later"), pending-request cap, friend cap. No raw error codes or stack traces are shown.
- **In-app route for links**: `/tabs/social/invite/$token`. The invite screen, on native and web build, shows the owner's handle, display name and avatar with an "Add friend" button and creates the friendship only when the user confirms; opening the screen, a cold-start replay, or a pending-link replay never redeems the invite by itself. It mirrors the TASK-171.2 outcomes: valid, already friends, own link, and a single "This invite link is no longer valid" state used for expired, revoked, deleted-owner and blocked links alike.
- **HTTPS deep links** (Android App Links; iOS Universal Links when iOS ships, TASK-83): `https://lesefluss.app/invite/<token>` is the only claimed path. Later subtasks that add a link path extend the same mechanism. Links never grant access to a book by themselves (ADR-0004: no forwardable share URLs); at most they point a signed-in user to an item that already belongs to them. Today the manifest only has the `lesefluss://auth-callback` custom scheme and file/share intents (`apps/capacitor/android/app/src/main/AndroidManifest.xml`).
  - Add a separate `<intent-filter android:autoVerify="true">` (VIEW, DEFAULT, BROWSABLE; scheme `https`, host `lesefluss.app`, `pathPrefix` `/invite/`). Claim only this prefix, never `/` or `/app/`, so the rest of the website and the web build keep opening in the browser.
  - Host `https://lesefluss.app/.well-known/assetlinks.json` from `apps/web` (a server route like `routes/robots[.]txt.ts`, or a static file under `public/.well-known/`), served as `application/json` with no redirect, for package `app.lesefluss`. Include the SHA-256 of the Play App Signing key (from Play Console) and of the local release keystore used by `build:apk` (`KEYSTORE_PATH` in `android/app/build.gradle`), so both Play installs and sideloaded APKs verify.
  - Route incoming URLs through one pure parser (URL to in-app route or "not ours") and one listener mounted in `src/routes/__root.tsx`. It must handle both warm starts (`App` `appUrlOpen`) and cold starts (`App.getLaunchUrl()`), dedupe the two like `useMobileAuthCallback` in `src/contexts/sync-context.tsx` does, and run whenever the app is native, not only when `NATIVE_SYNC_ENABLED` (the existing auth listener is gated on that and must keep ignoring `https://` URLs). The parser rejects anything that is not `https://lesefluss.app` and validates the token shape before routing.
  - A claimed path the installed app does not recognise (for example a path added by a later release) opens in `@capacitor/browser`, so the user is not bounced back into the app.
- **Website fallback**: TASK-171.2 owns the `/invite/<token>` page. This task adds a "get the app / continue in the web app" block on `apps/web` that the page embeds. It links to the Play Store (`PLAY_STORE_URL` in `apps/web/src/routes/download/index.tsx`) and to the matching web build route (`/app/tabs/social/invite/<token>`).
- **Offline behaviour**: social screens show a clear offline state with retry, and keep showing the last list from the TanStack Query cache if there is one; mutations are disabled while offline instead of being queued. Nothing social is stored in local SQLite, so no Drizzle migration.
- **Docs**: add `docs/deep-links.md`: the claimed paths, how a later subtask adds one (parser, intent filter, website page first), and where the assetlinks fingerprints come from and how to verify them (`adb shell pm get-app-links app.lesefluss`).
- **Privacy**: no new category of server data, so no privacy policy change. The device stores only the pending-link route (see implementation notes).

Out of scope: profile page content (TASK-171.5), inbox content (TASK-171.4), the website invite page itself (TASK-171.2), the in-app friend request to a buddy-read co-participant (TASK-171.8), reporting users from the Social tab (TASK-171.6 adds the report action to the overflow menu built here), deferred deep linking through a Play Store install (the user taps the link again after installing).

Implementation notes:
- `ShareIntentPlugin.handleIntent` (`android/app/src/main/java/app/lesefluss/ShareIntentPlugin.java`) forwards every `ACTION_VIEW` intent to `handleSharedFile`. Restrict that branch to `file` and `content` URIs so an App Link is never treated as a file import.
- A pending link must survive onboarding and sign-in. `routes/index.tsx` redirects first launches to `/onboarding`, and the native OAuth round trip through `Browser` can get the app killed. Keep the pending route in `@capacitor/preferences` and replay it after onboarding finishes and after sign-in succeeds, then clear it. Store only the latest link, drop it after 24 hours, and clear it on sign-out. Invite tokens are credentials for becoming someone's friend: do not write them or full link URLs to console logs, feedback reports or error reports.
- Cold-start deep links leave a history of length 1, and `components/app-shell/hardware-back.tsx` then exits the app on back. Seed the history so back from a deep-linked screen returns to `/tabs/social`.
- Social API calls need the same auth as sync: bearer token on native, same-origin cookie (`credentials: "include"`) on the web build. `syncFetch` in `src/services/sync/index.ts` does exactly that but is module-private; use the shared helper described in the cross-task contracts rather than writing a second auth path.
- The shared `queryClient` (`src/services/query-client.ts`) defaults to `staleTime: Infinity` and `retry: false` because it was built for local SQLite. Social queries set their own `staleTime`, refetch when the Social tab opens and on app foreground, and are invalidated after each mutation, so a request accepted on another device shows up without restarting the app.
- Social query cache must be scoped to the signed-in account. Native sign-out goes through `signOut()` in `src/services/sync/index.ts` (called from `logout` in `sync-context.tsx`); the web build has no in-app sign-out, and `adoptSyncIdentity()` is the only place an account switch is noticed. Remove all social query keys in both places (for example from `clearAccountScopedState()`), so a second account on the same device never sees the first account's friends. TASK-171.4 adds its inbox keys to the same clear.
- Older app versions without the intent filter keep opening the links in the browser. That is why the website page for every claimed path must exist before the path is claimed in a released build.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A Social tab appears in the tab bar and desktop sidebar on native and web builds
- [x] #2 Signed-out users see an explanation and a sign-in entry point that returns them to the Social tab after sign-in, on native and on the web build
- [x] #3 Users without a handle are asked to pick one before seeing social features, and then continue to the screen they were headed to
- [x] #4 User can accept, decline or cancel friend requests from the Social tab
- [x] #5 The add-friend entry point offers creating and sharing the invite link and pasting a received invite link, which opens the invite confirmation; the Social tab has no handle search
- [x] #6 An outgoing request that the recipient declined keeps showing as pending, and the UI has no declined state
- [x] #7 User can decline and block from an incoming request, remove a friend, and block or unblock a user, each behind a confirmation that says the other side is not notified
- [x] #8 The blocked-users list is reachable from the Social tab and shows only users the signed-in user blocked
- [x] #9 Friends and requests show only the handle, display name and avatar returned by the social API, never the email or the account's sign-up name
- [x] #10 User can create, copy, share via the OS share sheet (native) and revoke their invite link, and the screen shows the expiry date and that anyone with the link can become a friend
- [x] #11 Rate-limit, pending-request-cap and friend-cap errors from the API are shown as readable messages
- [x] #12 Empty states exist for no friends and no requests, the no-friends state points to the invite link, and pasting text that is not a valid invite link shows an inline hint
- [ ] #13 Tapping an https://lesefluss.app/invite/<token> link on Android with the app installed opens the invite confirmation screen, from both a cold start and a running app
- [x] #14 The invite screen creates a friendship only after the user taps Add friend; opening or replaying the link alone creates nothing
- [x] #15 The invite screen shows a single 'no longer valid' state for expired, revoked and blocked links, and distinct states for own link and already friends
- [x] #16 An invite link opened while signed out, without a handle, or before onboarding is finished leads to the invite confirmation after the user signs in, picks a handle or finishes onboarding
- [x] #17 A pending link is discarded after 24 hours and on sign-out
- [x] #18 Without the app installed, the invite link's website page shows the get-the-app / continue-in-web-app block, and continuing opens the invite confirmation in the web build
- [ ] #19 assetlinks.json is served from https://lesefluss.app/.well-known/assetlinks.json as application/json and Android App Links verification passes for both the Play-signed and the locally signed release build
- [x] #20 Website paths outside the claimed /invite/ prefix, including /app/, still open in the browser and not in the app
- [x] #21 A claimed link path the app does not recognise opens in the in-app browser without looping back into the app
- [x] #22 An App Link intent is never handled as a file import, and lesefluss://auth-callback sign-in and file open/share intents keep working
- [x] #23 Pressing back on a screen opened from a cold-start deep link returns to the Social tab instead of exiting the app
- [x] #24 Signing out, or switching account on the web build, clears all cached social data, so the next account sees only its own friends
- [x] #25 A friend request accepted on another device appears in the Social tab when the tab is reopened or the app returns to the foreground, without restarting the app
- [x] #26 Social screens show an offline state with retry instead of errors when the network is unavailable, keep showing the last cached list, and disable actions while offline
- [x] #27 Invite tokens and full link URLs do not appear in console logs or feedback and error reports
- [x] #28 Unit tests cover the deep link parser for invite, pasted invite text, unknown, foreign-host and malformed URLs, and the pending-link replay after sign-in, onboarding and expiry
- [x] #29 docs/deep-links.md documents the claimed paths, how to add a new one, and where the assetlinks fingerprints come from
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation plan

### 1. Deep-link parser and pending link (`apps/capacitor/src/services/deep-links/`)
- `parse.ts` (pure): `parseDeepLink(url) -> { kind: "invite", token } | { kind: "unknown-claimed", url } | null`. Accepts only `https://lesefluss.app` (host from `SYNC_URL`, fallback lesefluss.app), rejects other hosts, `/app/...` and `/`, validates the invite token as base64url of 40 to 64 chars. Same parser handles pasted text (trimmed, first URL-like token). `unknown-claimed` = under a claimed prefix but not recognised, opened in `@capacitor/browser`.
- `pending-link.ts`: `setPendingLink(route)`, `takePendingLink()` (drops entries older than 24 h), `clearPendingLink()` in `@capacitor/preferences`, storing only the in-app route string. Cleared from `clearAccountScopedState()` (covers sign-out and account switch).
- `use-deep-links.ts`: one listener mounted in `__root.tsx`, native only: `appUrlOpen` plus `getLaunchUrl()` on mount, deduped by URL like the auth listener. `lesefluss://` URLs are ignored (the auth listener owns them). Routing: if onboarding not finished or not signed in or no handle, store the pending route and navigate to onboarding / Social tab; else navigate to `/tabs/social/invite/$token`. Cold-start: seed history by navigating to `/tabs/social` first (replace) and then pushing the invite route, so back returns to the tab. Tokens are never logged.
- Replay: `useReplayPendingLink()` called from the Social tab page when signed in with a handle, from onboarding `finish`, and after `useMobileAuthCallback` succeeds (via the Social tab mount, since sign-in returns to the app).

### 2. Social cache module (`apps/capacitor/src/services/social/cache.ts`)
- `socialQueryOptions` defaults (`staleTime: 30 s`, `retry: 1`, `refetchOnWindowFocus: true`, `refetchOnMount: "always"`), `clearSocialQueries()` (removes `socialKeys.all`), `useRefetchSocialOnForeground()` (Capacitor `resume` + `visibilitychange`). `clearAccountScopedState()` in `services/sync/session.ts` calls `clearSocialQueries()` and `clearPendingLink()`; the existing `logout` call is replaced by that.
- `services/social/friends.ts`: `friendsClient` (relationships, request respond/cancel, remove, block, unblock, invite create/current/revoke/preview/redeem) over `authedFetch`, plus hooks `useRelationships`, `useRespondToRequest`, `useCancelRequest`, `useRemoveFriend`, `useBlockUser`, `useUnblockUser`, `useCurrentInvite`, `useCreateInvite`, `useRevokeInvite`, `useInvitePreview(token)`, `useRedeemInvite`. Mutations invalidate `socialKeys.relationships`. `socialErrorMessage(err)` maps `rate_limited`, `limit_reached`, `not_found`, `handle_required`, offline to copy. `useIsOnline()` from `navigator.onLine` + events.
- Core: `socialErrorMessage` strings for limit_reached / not_found / rate_limited go into `packages/core/src/social.ts` next to the existing message helpers.

### 3. Navigation
- `nav-items.ts`: add `{ to: "/tabs/social", label: "Social", icon: Users }` between Explore and Settings; `NavTarget` gets optional `badge?: number | "dot"` rendered by `TabBar` and `DesktopSidebar` (count pill or dot). Badge value provided through a tiny `useNavBadges()` hook returning `{ "/tabs/social": undefined }` for now (TASK-171.4 feeds it).
- Routes: `routes/tabs/social/index.tsx`, `routes/tabs/social/invite.$token.tsx`, `routes/tabs/social/blocked.tsx`, `routes/tabs/social/invite-link.tsx` as thin wrappers around `pages/social/*`.

### 4. Pages (`apps/capacitor/src/pages/social/`)
- `index.tsx` (Social tab): gates in order: signed out → `SignedOutSocial` (native: handoff + Browser; web build: `window.location.assign("/login?redirect=/app/tabs/social")`); loading; error/offline with retry (cached list kept if present); no handle → `HandleClaimStep` (onClaimed → replay pending link or stay); otherwise the tab: header with "Add friend" (invite link screen) button; sections: incoming requests (accept / decline / overflow: decline and block), outgoing (Pending, cancel), friends (overflow: remove, block; slot comment for Report), placeholders "Inbox", "Activity", "Buddy reads" (coming soon, disabled rows), link to "Blocked users". Empty states per spec. Mutations disabled while offline.
- `invite-link.tsx`: current link (url, expiry date), create / replace (confirm: old link stops working), copy, share (native `Share.share`, web copy), revoke (confirm); paste field: parser → hint if not an invite link, else navigate to invite screen. Copy states the warning text from the spec.
- `invite.tsx` (`/tabs/social/invite/$token`): uses preview endpoint; states valid (owner card + Add friend), already_friends, own, invalid (single copy), handle_required (claim step then confirm), signed out (sign-in entry; pending link kept); redeem only on tap. Back returns to `/tabs/social`.
- `blocked.tsx`: list with unblock (confirm).
- Shared `PersonRow` (identity card row + trailing actions) and `useConfirm` pattern via existing `ConfirmDialog` / `ActionSheet`.

### 5. Android
- `AndroidManifest.xml`: new `<intent-filter android:autoVerify="true">` VIEW/DEFAULT/BROWSABLE, `https` + `lesefluss.app` + `pathPrefix="/invite/"`.
- `ShareIntentPlugin.handleIntent`: ACTION_VIEW branch only for `file`/`content` schemes.

### 6. Website
- `public/.well-known/assetlinks.json` served via a server route `routes/.well-known/assetlinks[.]json.ts` (JSON content type, cache 1 h) for package `app.lesefluss` with the local release keystore SHA-256 (`04:D5:...:B7`) and a placeholder comment in docs for the Play App Signing key (value must be copied from Play Console; not available here).
- `components/invite-app-cta.tsx`: Play Store button + "Continue in the web app" link to `/app/tabs/social/invite/<token>`; embedded into `routes/invite/$token.tsx` in the valid, handle_required, signed_out and already_friends states (replaces the empty slot).

### 7. Docs and tests
- `docs/deep-links.md`: claimed paths, adding a path (website page first, parser, intent filter), fingerprints (Play Console + `keytool -list -v`), verification (`adb shell pm get-app-links app.lesefluss`, `adb shell am start -W -a android.intent.action.VIEW -d "https://lesefluss.app/invite/x"`).
- Unit tests: `parse.test.ts` (invite, pasted text with surrounding words, unknown claimed path, foreign host, `/app/` path, malformed, bad token shape), `pending-link.test.ts` (store/take/expiry/clear with mocked Preferences).
- Type-check + full capacitor suite, web type-check (assetlinks route, CTA), lint.

### Out of scope / not verifiable here
- Play App Signing fingerprint (needs Play Console). Device verification of App Links (needs a device). iOS.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cross-task contracts (from the final review of the TASK-171 set):
- **Authed fetch**: use the shared helper TASK-171.1 extracts from `syncFetch`; do not export `syncFetch` or add a second auth path.
- **No-handle state** embeds TASK-171.1's claim step component (identity-card preview), not a simpler picker.
- **Invite screen** calls TASK-171.2's read-only preview endpoint to render the owner and outcome state, and its confirm endpoint only on "Add friend". The expiry date comes from `expiresAt` in TASK-171.2's invite responses.
- **Website fallback block**: build the block and embed it into TASK-171.2's existing `/invite/<token>` page (AC #18).
- **Badge slot**: add a generic optional badge (count or dot) to `NavTarget` in `nav-items.ts`, rendered by `TabBar.tsx` and `DesktopSidebar.tsx`. TASK-171.4 feeds it the unread count.
- **Social-cache clear**: a single exported function (for example `clearSocialQueries()`) that removes every social query key by a shared key prefix, called from native `signOut()` and from `adoptSyncIdentity()`. Later subtasks (171.4, 171.5, 171.8, 171.10) use the same prefix so they are covered without editing it. The same module owns the refresh rules (own `staleTime`, refetch on Social tab open and on app foreground) that TASK-171.4 and later subtasks reuse.
- **Report entry points**: the overflow menus on friend rows and incoming requests leave room for a "Report" item, which TASK-171.6 adds.
- **New link paths** added by later subtasks (for example a push tap target) follow `docs/deep-links.md`: add the `pathPrefix` to the autoVerify intent filter only after the website page for it is live. Profiles, book shares and buddy-read invites have no URLs; profiles are reached from in-app lists, and shares and buddy-read invites from the inbox.

Deep links: `parseDeepLink` accepts `https://` on the SYNC_URL origin or lesefluss.app only, and only under claimed prefixes; unknown claimed paths open in @capacitor/browser. Pending links are structured (`{ kind: "invite", token }`) so replays navigate with typed params; stored 24 h in Preferences, cleared by `clearAccountScopedState()` (sign-out and web-build account switch) together with `clearSocialQueries()`. Replay points: onboarding `finish`, Social tab mount, and the invite screen itself keeps the link while signed out and clears it once signed in. Cold start seeds `/tabs/social` under the destination when history length is 1.

The TanStack Router generator skips dot-directories, so the assetlinks route lives in `routes/[.]well-known/assetlinks[.]json.ts` (bracket escape). The Play App Signing SHA-256 is read from `PLAY_APP_SIGNING_SHA256` at runtime because it is only available in Play Console; the local release keystore fingerprint is hard-coded.

Not verifiable here and left unchecked: AC #13 (device App Link tap) and AC #19 (verification passes for both signing keys; the Play fingerprint env var must be set on the server first). UI states were type-checked and linted, not exercised on a device or in a browser. `PLAY_STORE_URL` moved to `lib/store-links.ts` so the download page and the invite CTA share it.

Review pass (5 sonnet reviewers, claims verified by hand) fixed: the deep-link dedup guard never reset, so tapping the same invite link twice in one app session was swallowed (now a 2 s duplicate-delivery window, and the handler is `createDeepLinkHandler(deps)` so its decisions are unit-tested: ignore auth scheme and foreign hosts, unknown claimed path to browser, onboarding gate stores the pending link, cold-start double delivery collapsed but later re-open handled); the relationships, invite-link and blocked screens rendered nothing while loading (shared `Spinner`); the handle claim step was the one mutation not disabled offline; 'Back to Social' pushed history so hardware back returned to a finished invite screen (now replace); the Requests section had no empty copy; the overflow button ignored in-flight mutations; invite inputs lacked labels. DRY: `Section`/`EmptyRow` moved to `components/app-shell/section.tsx` (used by the social screens and the social settings screen; older settings screens keep their pre-existing copies), `IdentityCardBox` in `@lesefluss/ui/social-avatar` replaces the two OwnerCard copies, `SOCIAL_API` route map in core is used by both the app and the website clients, the website invite page imports `PROFILE_KEY` instead of re-typing the key, `SocialGate` takes plain children. Task reference comments removed from source; docs path for the assetlinks route corrected.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Social tab and HTTPS deep links

### What changed
- **Deep links** (`apps/capacitor/src/services/deep-links/`): pure `parseDeepLink` / `parsePastedInvite` (origin, scheme, claimed prefix and token shape checks; `unknown-claimed` opens in the in-app browser), `pending-link.ts` (Preferences, latest only, 24 h, structured), `use-deep-links.ts` (root listener for `appUrlOpen` + `getLaunchUrl`, deduped, native only, ignores `lesefluss://`; routes to onboarding with a pending link when onboarding is unfinished; seeds the Social tab under a cold-start destination). Replay after onboarding, on Social tab mount, and the invite screen keeps/clears the link around sign-in.
- **Social cache** (`services/social/cache.ts`): shared query defaults (30 s stale, retry 1, refetch on mount/focus), `clearSocialQueries()` wired into `clearAccountScopedState()`, `useRefetchSocialOnForeground()`, `useIsOnline()`. `services/social/friends.ts`: `friendsClient` over `authedFetch` and hooks for relationships, respond/cancel/remove/block/unblock, invite create/current/revoke/preview/redeem; `socialErrorMessage` maps API reasons to copy (core `socialActionErrorMessage`).
- **Navigation**: Social tab in `NAV_ITEMS`; `NavBadge` slot (count or dot) rendered by `TabBar` and `DesktopSidebar`, fed by `useNavBadges()` (empty until the inbox).
- **Pages** (`pages/social/`): `SocialGate` (signed-out / loading / offline-retry / handle claim), Social tab (incoming requests with accept, decline, decline-and-block; friends with remove/block overflow and a Report slot comment; sent requests shown as Pending with cancel; placeholders for inbox, activity, buddy reads; blocked-users link; offline banner keeps cached lists and disables actions), invite-link screen (create/replace with warning, copy, OS share, revoke with confirmation, expiry date, paste box with inline hint), invite confirmation `/tabs/social/invite/$token` (preview only; redeem on tap; single invalid state; own / already friends; inline handle claim; signed-out keeps the pending link), blocked users with unblock confirmation.
- **Android**: `autoVerify` intent filter for `https://lesefluss.app/invite/`; `ShareIntentPlugin` treats only `file`/`content` URIs as imports.
- **Website**: `/.well-known/assetlinks.json` route (local release key fingerprint plus optional `PLAY_APP_SIGNING_SHA256`), `InviteAppCallToAction` (Play Store + continue in web app) embedded in the invite page's valid, handle-required, signed-out and success states; `PLAY_STORE_URL` shared via `lib/store-links.ts`.
- **Docs**: `docs/deep-links.md` (claimed paths, moving parts, adding a path, fingerprints, verification); `agents/capacitor.md` tab list updated.

### Tests
- `parse.test.ts` (invite, trailing slash, foreign host, http, root, `/app/`, other paths, auth scheme, malformed, unknown claimed variants, pasted text), `pending-link.test.ts` (once, latest wins, 24 h expiry, malformed, clear), `replay.test.ts` (replay once, expired ignored, cold-start history seeding). Capacitor suite 665 tests green, type-check and lint clean; web type-check clean after the route tree regeneration.

### Not verified / follow-ups
- On-device App Link verification (AC #13, #19) and the Play App Signing fingerprint (set `PLAY_APP_SIGNING_SHA256` on the server).
- UI not run in a browser or on a device.
- TASK-171.4 feeds `useNavBadges()` and adds inbox keys under the same `social` prefix.

### Review pass
Five fresh-context reviewers (sonnet), each claim re-verified against the code. Fixed: deep-link dedup swallowing a second tap of the same link, blank loading states, claim step usable offline, back navigation pushing onto a finished invite screen, missing empty-requests copy, menu button ignoring in-flight mutations, unlabeled inputs; shared `Section`, `IdentityCardBox` and `SOCIAL_API` route map remove duplication between screens and between the app and website clients; deep-link handler extracted and covered by tests (ignore, browser fallback, onboarding gate, dedup window). Security review found nothing. Suites afterwards: capacitor 673 (21 deep-link tests), web and packages type-check and lint clean.
<!-- SECTION:FINAL_SUMMARY:END -->
