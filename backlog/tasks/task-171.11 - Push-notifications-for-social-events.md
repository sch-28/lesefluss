---
id: TASK-171.11
title: Push notifications for social events
status: Done
assignee: []
created_date: '2026-09-25 22:12'
updated_date: '2026-10-04 17:38'
labels:
  - social
  - app
  - web
milestone: m-14
dependencies:
  - TASK-171.3
  - TASK-171.4
  - TASK-171.5
  - TASK-171.7
  - TASK-171.8
  - TASK-171.9
modified_files:
  - packages/core/src/push.ts
  - packages/core/src/index.ts
  - apps/web/src/db/schema.ts
  - apps/web/drizzle/0034_push_token.sql
  - apps/web/drizzle/0035_push_outbox.sql
  - apps/web/drizzle/meta/_journal.json
  - apps/web/src/server.ts
  - apps/web/src/lib/social/inbox.ts
  - apps/web/src/lib/push/tokens.ts
  - apps/web/src/lib/push/tokens.integration.test.ts
  - apps/web/src/lib/push/fcm.ts
  - apps/web/src/lib/push/outbox.ts
  - apps/web/src/lib/push/preferences.ts
  - apps/web/src/lib/push/compose.ts
  - apps/web/src/lib/push/drain.ts
  - apps/web/src/lib/push/drain.integration.test.ts
  - apps/web/src/routes/api/push/register.ts
  - apps/capacitor/src/services/push/index.ts
  - apps/capacitor/src/services/sync/index.ts
  - apps/capacitor/src/contexts/sync-context.tsx
  - apps/capacitor/android/app/src/main/AndroidManifest.xml
  - apps/capacitor/android/.gitignore
  - apps/capacitor/package.json
parent_task_id: TASK-171
priority: low
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The in-app inbox (TASK-171.4) only surfaces events when the user opens the app. For time-sensitive events (friend request, book share, buddy-read invite, reply in a buddy read) a push notification brings people back.

Provider (decided): Firebase Cloud Messaging. Timing (decided): this task is deferred until the rest of the social roadmap is done; it stays low priority and is the last item on the roadmap.

Depends on TASK-171.4 (notification events and types — push is another delivery channel for the same events, never a separate event source), TASK-171.3 (in-app routes and deep-link routing that taps reuse), TASK-171.5 (the per-book "hide from profile" flag), and the subtasks that produce the pushed event types: TASK-171.7 (shares), TASK-171.8 (buddy-read invites), TASK-171.9 (discussion replies and reactions, and the spoiler gating previews reuse).

Scope:
- **Android**: Firebase Cloud Messaging via `@capacitor/push-notifications` (not yet a dependency). iOS/APNs when the iOS build exists (TASK-83); the design must not assume Android-only (token rows carry a platform, sending goes through one provider interface).
- **Web build**: stays inbox-only (Web Push would need a new service worker and VAPID keys for little gain). Record the decision in the task notes; the web build never shows a notification permission prompt.
- **Device tokens**: registered per device after sign-in, stored server-side, removed on sign-out, on FCM invalidation, when the session ends, and on account deletion. A token row stores only token, platform, user id, session id and timestamps.
- **Events and categories**: each TASK-171.4 inbox type maps to one category. *Friend requests* (received, accepted), *Shares* (received, accepted), *Buddy reads* (invite, joined, finished), *Discussion* (replies and reactions on your comments or highlights). Report outcomes (TASK-171.6) stay inbox-only. Unmapped future types are not pushed.
- **Permission**: never on first launch. Asked after the user sends or accepts their first friend request, and from an "Enable notifications" row in the inbox and push settings, with a short in-app explainer before the OS prompt. After a decline the app never re-prompts on its own; push settings shows that notifications are off in system settings and how to enable them. Android 13+ runtime permission handled.
- **Preferences**: one toggle per category plus "Show message previews", all default on, stored server-side so they apply on all devices. Shown only when signed in on a native build. Quiet hours are out of scope (Android Do Not Disturb covers it).
- **Payload privacy (data minimisation)**: only the actor's display name, a fixed English event text (the app has no localisation), the in-app route and the inbox item id. Optionally the book title, except for books the sender hid from their profile (TASK-171.5); and for Discussion a preview of at most 100 characters, only when previews are on and only if the text is anchored at or before the recipient's furthest position (TASK-171.9 gating), otherwise just "new reply". No book content, positions, user ids or emails.
- **Tap handling**: opening a notification deep-links to the relevant screen (reuse TASK-171.3 routing).
- **Batching**: reactions or replies on the same subject within two minutes collapse into one push ("Anna and 2 others replied").
- **Abuse and staleness**: at most 20 pushes per recipient per hour and 5 per actor–recipient pair per hour; the rest stay inbox-only. A push not sent within 24 hours is dropped. Sent or dropped outbox rows are deleted.
- **Privacy policy**: covers FCM as a processor.

Out of scope: live reading races (TASK-171.12), email notifications, push for non-social events, Web Push, quiet hours, pushing report outcomes.

Implementation notes (verified against the code):
- **Android build.** `apps/capacitor/android/app/build.gradle` already applies the `com.google.gms.google-services` plugin only when `google-services.json` exists, and otherwise just logs that push won't work; the file is not in the repo. `.github/workflows/release.yml` must write it from a CI secret and fail the build if it is missing. `AndroidManifest.xml` has only `INTERNET` today; add `POST_NOTIFICATIONS` (targetSdk 36, minSdk 24) and create a notification channel on startup via the plugin's `createChannel`.
- **Server sending.** Use the FCM HTTP v1 API with a service-account credential from a new optional env var (guard like `requireEnv` in `apps/web/src/lib/auth.ts`, but dev and self-hosted setups without Firebase just skip push); the legacy server-key API is shut down. `UNREGISTERED` / `INVALID_ARGUMENT` token errors delete the token row. Set Android notification visibility to private.
- **Outbox, not inline sends.** `apps/web` has no job runner (the container runs `node .output/server/index.mjs` from `scripts/entrypoint.sh`), and in-memory timers are lost on restart and duplicated across instances. Write a push outbox row in the same transaction as the TASK-171.4 inbox insert, and drain it from an in-process interval loop claiming rows with `SELECT … FOR UPDATE SKIP LOCKED`. Batching is a `send_after` delay: a new reply/reaction for the same `(recipient, category, subject)` merges into the pending row. Set the Android notification `tag` per subject so the device replaces rather than stacks. The row stores references (inbox item id, actor id), not text; text is rendered at send time.
- **Re-check at send time**: preferences, block/friendship state from TASK-171.2 (block or unfriend suppresses), whether the item still exists (cancelled request, TASK-171.6 takedown), whether the inbox item is already read, rate caps and the 24-hour limit.
- **Device tokens bound to the session.** `requireAuth` in `apps/web/src/lib/session-middleware.ts` returns `context.session`; store each token with the better-auth session id and user id. The FCM token is the unique key, upserted, so a device signing into another account reassigns the row. Native `signOut()` in `apps/capacitor/src/services/sync/index.ts` clears the bearer first and calls `/api/auth/sign-out` fire-and-forget, so: call deregister before `clearToken`, also call the plugin's `unregister()` locally, and on the server skip and delete rows whose session no longer exists or has expired (covers revoked sessions and banned users).
- **Registration endpoints** are file routes under `apps/web/src/routes/api/` with `middleware: [cors, requireAuth]` like `api/sync.ts`, rate-limited with `checkLimit` (`push-register:${userId}`). Client calls use the shared authed-fetch helper extracted from `syncFetch` (TASK-171 cross-cutting notes). Re-register on every app start and on the plugin's `registration` event, since FCM rotates tokens.
- **Preferences storage.** A server-only table (or TASK-171.1's social settings row), not `sync_settings`: every app version pushes that row whole, so older builds would overwrite unknown fields. A missing row means defaults. Fetched with TanStack Query; toggles in a page under `apps/capacitor/src/routes/tabs/settings/`; a toggle that fails offline shows an error and reverts.
- **Tap and foreground handling.** Register `pushNotificationActionPerformed` early (in `src/routes/__root.tsx` next to the TASK-171.3 link listener) so cold-start taps are not missed. The payload's in-app route is validated through the TASK-171.3 URL parser, never navigated to blindly. Taps before onboarding or sign-in finishes use TASK-171.3's pending-route mechanism. A tap for an account no longer signed in opens the Social tab; a tap on an item that no longer exists lands on the inbox's not-found state. Opening a notification marks its inbox item read. On foreground `pushNotificationReceived` (Android shows nothing), invalidate the inbox and unread-count queries.
- **Web build.** No service worker exists today. All push code is guarded by `Capacitor.isNativePlatform()` so the web build never loads the plugin.
- **Rollout.** Older app builds never register a token and so get no push; the sync payload is unchanged.
- **Account deletion.** Token, preference and outbox rows reference `user.id` with `onDelete: "cascade"` on every user column (recipient and actor), so `deleteUserAccount`, better-auth's `afterDelete` hook and admin `deleteAdminUser` (switched to `deleteUserAccount` per TASK-171) all cover it without purge code. Extend `account-deletion.integration.test.ts`.
- **Privacy policy** (`apps/web/src/routes/privacy/index.tsx`): Google Firebase Cloud Messaging as processor, data sent (device token, notification text), legal basis (opt-in via OS permission and toggles), the US transfer and its safeguard, and token deletion on sign-out, session end or account deletion.

Docs: a short push-setup section (Firebase project, `google-services.json` CI secret, server credential env var) in the developer docs, and the event-to-category mapping documented next to the TASK-171.4 type set.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Android users who grant permission receive push notifications for each mapped event: friend request received and accepted, share received and accepted, buddy-read invite, joined and finished, and discussion replies and reactions on their items
- [x] #2 Notification permission is requested in context after the first sent or accepted friend request, never on first launch
- [x] #3 A user who declines the permission is not prompted again automatically, and push settings shows that notifications are disabled in system settings with how to enable them
- [x] #4 Per-category toggles and the preview toggle default to on, are stored server-side, and are respected on every device of the account
- [x] #5 Tapping a notification opens the relevant screen in the app, including from a cold start, and marks the inbox item read
- [x] #6 Tapping a notification whose item no longer exists lands on the inbox without an error screen
- [x] #7 Device tokens are removed on sign-out, invalidation and account deletion (through all three deletion entry points)
- [x] #8 A device that signs out while offline, or whose session expired or was revoked, receives no further pushes for that account
- [x] #9 The same device signing into a second account receives pushes only for the account currently signed in
- [x] #10 Payloads contain no book content, positions, user ids or emails, and omit titles of books hidden from the sender's profile
- [x] #11 Discussion previews are at most 100 characters, absent when previews are disabled, and absent for text anchored beyond the recipient's furthest position
- [x] #12 Bursts of reactions or replies on the same subject within the batching window collapse into a single notification
- [x] #13 A push is not sent if, by send time, the recipient blocked or unfriended the actor, disabled the category, already read the inbox item, or the item no longer exists
- [x] #14 Pushes beyond the per-recipient and per-actor hourly caps, or older than 24 hours, are not sent and remain visible in the inbox
- [x] #15 A server restart or a second server instance neither loses nor duplicates pending pushes
- [x] #16 The server runs without push credentials configured, skipping push delivery without errors
- [x] #17 The release workflow fails if google-services.json is not provided
- [x] #18 The web build shows no notification permission prompt and does not load the push plugin, and the inbox-only decision is recorded
- [x] #19 Privacy policy names the push provider, the data sent, the legal basis, the US transfer and token retention
- [x] #20 Developer docs describe push setup, and the event-to-category mapping is documented next to the inbox type set
- [x] #21 Tests cover token lifecycle, preference filtering, payload rules (hidden titles, previews, spoiler gating), send-time re-checks, rate caps, staleness and batching
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cross-task contracts (from the final review of the TASK-171 set):
- The outbox row is written from inside TASK-171.4's single `createNotification(tx, …)` function, so every current and future inbox type gets one hook point. Collapsed inbox items keep a stable id (TASK-171.4), so a pending outbox row stays valid when an item is updated in place.
- Discussion previews call TASK-171.9's exported spoiler-gating function at send time.
- Unmapped types are not pushed. That covers TASK-171.12's race invites, the TASK-171.7 "shared book removed" item and the TASK-171.6 statement-of-reasons and notice-decision items. Adding a category for race invites is a separate follow-up.
- Push preferences live in a server-only table or on TASK-171.1's `social_profile` row, never in `sync_settings`. A tap target that needs a new https link path follows TASK-171.3's `docs/deep-links.md` (website page first, then the intent filter); plain in-app routes do not need that.

## Correction (2026-09-28): races are gone
TASK-171.12 (live reading races) was dropped and archived without shipping. TASK-171.15 (the live board) replaced it. The `race_invite` inbox type never shipped. Ignore the race mentions in this task's out-of-scope line and in the note on unmapped types that says race invites are not pushed. The live board sends no inbox items or notifications, so it adds no push category.

Phase 1 (2026-10-04): device tokens. `social_push_token` (migration 0034) keys on the FCM token and references `session.id` with cascade, so better-auth sign-out, session revocation, bans and account deletion drop the token with no extra code; no unregister endpoint was needed. `POST /api/push/register` upserts (second account on the same device takes the row over). Client `services/push` lazy-imports the plugin, registers only when permission is already granted (never prompts), runs on every signed-in start, and `signOut()` calls the plugin's `unregister()` locally for the offline case. Expired sessions still need the send-time `expires_at` check in phase 2. Added POST_NOTIFICATIONS to the manifest and gitignored google-services.json.

Phase 2 (2026-10-04): outbox and sender. Migration 0035 adds `social_push_preferences`, `social_push_outbox` and `social_push_sent` (the last hour of sends, for the caps), all cascading on every user column. `createNotification` calls `enqueuePush` in the same transaction; nothing is queued without `FIREBASE_SERVICE_ACCOUNT_BASE64`. Outbox rows reference the event by `(recipient, type, actor, subject)` through a `dedupe_key`, not by inbox item id, because collapsed reply/reaction items are deleted and re-inserted (new id), which the original note assumed would not happen. Replies and reactions use a key without the actor and keep the first row's `send_after` (now + 2 min), so a burst becomes one push titled from the inbox payload ("carol and 1 other"). `drainPushOutbox` (10 s interval started from `src/server.ts`, one per process) claims due rows with `FOR UPDATE SKIP LOCKED`, and at send time re-checks age (24 h), the hourly caps, preferences, inbox visibility through the inbox's own `visibleItems` (block, takedown, banned actor, gone subject), read state, friendship for friend/share types, and session expiry (expired-session tokens are deleted). The FCM v1 sender signs its own JWT with node:crypto (no new dependency); 404/UNREGISTERED/INVALID_ARGUMENT delete the token, other failures retry a minute later. Titles are left out when the sender (share) or actor (buddy read) hid the book from their profile; reply previews go through `isVisibleToViewer` and are clipped to 100 chars. Push data carries only the route and the inbox item id; Android notifications are posted on channel `social` with visibility PRIVATE and a per-subject tag.

Review pass (2026-10-04, 3 reviewers + verifier, all 20 findings confirmed and fixed): the drainer no longer sends inside a transaction (lease via send_after, compare-and-delete per row, no locks held during HTTP); FCM sender never throws, has a 10 s timeout, and only deletes a token when FCM blames the token (404, UNREGISTERED, or INVALID_ARGUMENT naming message.token), since a payload INVALID_ARGUMENT would otherwise let a long display name wipe a victim's devices; titles are clipped to DISPLAY_NAME_MAX_LENGTH and all clipping is by code point; push counts as configured only when the credential parses; offline sign-out is persisted (`sync_pending_sign_out`) and retried on start, which ends the session server-side and so drops the token row, then unregisters FCM unless someone signed in since.

Phase 3 (2026-10-04): app side. `GET/POST /api/push/preferences` (partial patch, server-only table). Settings > Notifications page (native + signed in only): device permission state with how to enable it in system settings, per-category toggles and previews, optimistic with revert on failure. Explainer dialog before the OS prompt, offered once after the first sent or accepted friend request (`push_permission_asked` flag, never again on its own) and from an Enable notifications row in the inbox. Taps: `pushNotificationActionPerformed` in the root, payload route checked against an allowlist (inbox, buddy-read/<uuid>, buddy-read-discussion/<uuid>), marks the inbox item read, falls back to the Social tab when signed out and to the inbox when the buddy read is gone, and is kept as a pending link (new kinds) across onboarding. Foreground pushes refresh the inbox and badge. Channel `social` created before register; status-bar icon is the launcher's monochrome glyph via FCM default_notification_icon. Verified on a Pixel 8 Pro against a local server: share push delivered through the drainer, cold-start tap opened the inbox and marked the item read.

Web build (decision): stays inbox-only. No Web Push, no service worker, no permission prompt; the plugin is only imported dynamically behind a native platform check, and the settings row and inbox row are hidden.

Phase 4 (2026-10-04): release.yml writes google-services.json from GOOGLE_SERVICES_JSON_BASE64 and fails without it; privacy policy has a Push notifications section and an FCM third-party entry (processor, data sent, consent, US transfer under DPF/SCCs, retention, one-hour send log); docs/push-notifications.md covers setup, the category mapping and delivery; NOTIFICATION_TYPES points at PUSH_CATEGORY_TYPES; FIREBASE_SERVICE_ACCOUNT_BASE64 in apps/web/.env.example.

Review pass 2 (4 reviewers + verifier, 30 of 31 findings confirmed and fixed, one uncertain race dropped): a reply landing while its batched push is mid-send now pulls the leased row back (least(send_after, now+window)) so it is sent again; per-row try/catch in the drainer; tokens checked before compose; expired-session tokens swept each tick; one token per session; push routes and the preview limit live in core (pushRoute/parsePushRoute) and both sides use them; account-deletion integration test covers push rows. App: registration re-synced on start and every resume (registers after a grant in system settings, unregisters after a revoke so the server stops sending), pending sign-out retried on resume and when back online, delivered notifications cleared on sign-out, explainer also offered after redeeming an invite, optimistic toggles revert per key and refetch once the last change settles, a cold-start tap now counts as a launch intent (no auto-open of the last book underneath), a tap replayed after onboarding gets the same gone-buddy-read fallback.

Review pass 3 (2026-10-04, fixes of pass 2 only; 2 reviewers + verifier; 7 of 9 findings confirmed and fixed, one refuted, one wording item dropped as uncertain): the app posts a token only when the (token, account) pair changes, since the plugin reports the token on every register() and that runs on every resume (would hit the 20/h register limit); pending sign-outs are a list, retried with one shared in-flight attempt, and 408/429 keep the entry; a per-session advisory lock in registerPushToken; privacy text now says a revoked phone's token goes when Google first reports it invalid. New tests for the sign-out retry.

Device test after review pass 3 (2026-10-04): token dedupe holds (register() on start + 4 resumes, one POST). The offline sign-out test found an older bug: the app's POST /api/auth/sign-out had no JSON Content-Type, so better-auth answered 415 and never ended the session, which also means native sign-out never ended server sessions before. Fixed (Content-Type + `{}` body); the retry now keeps an entry unless the answer is 2xx or 401. Re-tested on the Pixel: offline sign-out, then network back, ends the session and removes its push token within seconds.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Push notifications for social events via Firebase Cloud Messaging, Android first, iOS-ready (platform column, one sender).

Server (apps/web/src/lib/push): device tokens bound to better-auth sessions (cascade on sign-out, revocation, ban, account deletion; one token per session; expired sessions swept). `createNotification` queues an outbox row in the same transaction; replies and reactions batch for 2 minutes. An in-process drainer leases due rows and sends through the FCM HTTP v1 API with a self-signed service-account JWT (no new dependency), re-checking age, caps, preferences, inbox visibility, read state and friendship at send time. A failed send deletes a token only when FCM blames the token itself. Preferences API, privacy-minimal payloads (name, fixed text, optional title unless hidden, gated 100-char previews). Runs unchanged without `FIREBASE_SERVICE_ACCOUNT_BASE64`. Migrations 0034, 0035.

App (apps/capacitor/src/services/push): registration matched to the OS permission on start and resume (a token is posted only when it or the account changes), explainer before the OS prompt (after the first friendship, from the inbox, from settings), Settings > Notifications, allowlisted tap routes with cold-start and onboarding handling, foreground inbox refresh, offline sign-out retry, tray cleared on sign-out. Web build stays inbox-only.

Release, privacy, docs: release.yml requires GOOGLE_SERVICES_JSON_BASE64; privacy policy covers FCM; docs/push-notifications.md.

Verified: three review passes (9 reviewers, 3 verifiers, 57 findings fixed), web 293/293 and capacitor 1059/1059 tests, and on a Pixel 8 Pro against a local server: delivery, cold-start tap, permission explainer, revoke and re-grant.

Before release: set FIREBASE_SERVICE_ACCOUNT_BASE64 on the production server.
<!-- SECTION:FINAL_SUMMARY:END -->
