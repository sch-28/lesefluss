# Push notifications

Inbox items, delivered to the Android app through Firebase Cloud Messaging (TASK-171.11). Push is
another channel for the inbox, never a source of its own: every push starts as an inbox item
written by `createNotification` in `apps/web/src/lib/social/inbox.ts`.

Server: `apps/web/src/lib/push/` (`outbox.ts` queues, `drain.ts` sends, `compose.ts` renders and
re-checks, `fcm.ts` talks to FCM). App: `apps/capacitor/src/services/push/`.

## Setup

1. Firebase console: add an Android app with package name `app.lesefluss`. SHA-1 is not needed.
2. Download `google-services.json` to `apps/capacitor/android/app/` (gitignored). Without it
   `build.gradle` skips the google-services plugin and the build cannot receive pushes.
3. CI: the `GOOGLE_SERVICES_JSON_BASE64` repository secret holds `base64 -w0 google-services.json`.
   The release workflow writes the file from it and fails when the secret is missing.
4. Server: Project settings > Service accounts > Generate new private key, then set
   `FIREBASE_SERVICE_ACCOUNT_BASE64` to `base64 -w0 <key>.json`. Keep the key out of the repo.
   Without the variable (dev, self-hosted) nothing is queued and the server runs as before.

The FCM HTTP v1 API must be enabled (Project settings > Cloud Messaging). The legacy server-key
API is not used.

## Event categories

Each inbox type is pushed under one category, which the user can switch off (Settings >
Notifications). `PUSH_CATEGORY_TYPES` in `packages/core/src/push.ts` is the source of truth; a type
not listed there stays inbox-only.

| Category          | Inbox types                                                         |
| ----------------- | ------------------------------------------------------------------- |
| `friend_requests` | `friend_request_received`, `friend_request_accepted`                |
| `shares`          | `share_received`, `share_accepted`                                  |
| `buddy_reads`     | `buddy_read_invite`, `buddy_read_joined`, `buddy_read_finished`     |
| `discussion`      | `buddy_read_reply`, `buddy_read_reaction`                           |

Inbox-only: `friend_joined_via_invite`, `share_removed`, `statement_of_reasons`,
`notice_decision`.

## Delivery

- The outbox row is written in the same transaction as the inbox item and names the event
  (recipient, type, actor, subject), not its text. Text is rendered at send time.
- Replies and reactions on one subject merge into one pending row for two minutes, so a burst is
  one push ("Anna and 2 others"). Other types send within one drain tick (10 s).
- At send time a push is dropped when it is older than 24 hours, over the caps (20 per recipient
  and 5 per sender to the same recipient per hour), its category is off, the inbox item is read or
  no longer visible (block, takedown, gone subject, banned sender), or, for friend and share
  types, the two are no longer friends.
- Rows are leased by moving `send_after`; no transaction stays open while FCM answers. A process
  that dies after a send resends that row once its lease ends, and the per-subject Android tag
  replaces the earlier notification.
- A token is deleted only when FCM blames the token itself (404, `UNREGISTERED`, or
  `INVALID_ARGUMENT` naming `message.token`).

## Device tokens

A token row references the better-auth session that registered it, so sign-out, revocation,
bans and account deletion remove it by cascade, and a session keeps only its latest token. Tokens
of expired sessions are swept on every drain tick. A sign-out that could not reach the server is
retried on start, on resume and when the network comes back.

On start and on every resume the app matches its registration to the OS permission: it registers
once notifications are allowed (also from system settings) and deletes its FCM token once they are
turned off, so the server's next send gets `UNREGISTERED` and drops the row. Below Android 13 the
permission always reads as granted, so turning notifications off there is not detected.

## Web build

Inbox-only by decision: no Web Push, no service worker, no permission prompt. The plugin is only
imported behind a native platform check.
