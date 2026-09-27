# Notices and moderation

How reports come in, how an admin decides them, and what a decision does. Legal background:
`backlog/decisions/ADR-0004-friends-only-book-sharing.md` (DSA hosting-provider position). The
operating procedure is the Backlog document "Moderation runbook".

## Code layout (`apps/web/src/lib/moderation/`)

- `targets.ts`: the registry of things a notice can point at (`NOTICE_TARGETS`). Each entry
  resolves a target from an in-app id or from the web form's free-text location, snapshots it,
  renders its live context for the queue, and lists the actions that make sense for it. A later
  feature adds a type here and to `NOTICE_TARGET_TYPES` in core; `social_notice` does not change.
- `notices.ts`: `createNotice` (in-app), `createWebNotice` (public form), `listNotices` (open first,
  oldest first; purges closed notices older than 24 months on every load).
- `decide.ts`: `decideNotice` runs one action, closes the notice, applies the repeat-offender rule,
  writes the inbox items, then sends the mails and records how they went in `mail_state`.
  `resendNoticeMail` repeats one of them with the stored text.
- `restrictions.ts`: sharing suspensions (`isSharingSuspended`, `suspendSharing`,
  `liftRestriction`) and `REPEAT_OFFENDER = { count: 3, windowDays: 180 }`.
- `takedown.ts`: `tombstoneBook` (shared with the admin book delete), `takeDownBooks` (tombstone
  plus `social_takedown` record), `takenDownBookIds` (used by the sync push to drop removed books
  from a payload) and `isOriginTakenDown`.
- `mail.ts`: templates. The alert to `notices@lesefluss.app` is the only mail carrying the
  notifier's text; the receipt never repeats it because the address is unverified.
- `ban.ts`: better-auth `banUser` / `unbanUser` behind a dependency, imported lazily so tests run
  without the auth env.

Server functions for the admin UI are in `lib/admin-notices.ts`; the queue lives at
`/admin/notices`. Routes: `POST /api/report` (public, honeypot, 12 kB cap, 5/h per IP and 50/h
global) and `POST /api/social/report` (`cors` + `requireAuth`, 10/h per user).

## Actions and what the affected user gets

| Action | Effect | Statement of reasons |
| --- | --- | --- |
| reject | notice closed | none; the reported user is not told |
| remove_bio | `social_profile.bio` nulled | yes |
| remove_avatar | `social_avatar` row deleted | yes |
| reset_handle | handle into the 90-day hold without reclaim, profile hidden until a new one | yes |
| take_down_book | `tombstoneBook` + `social_takedown` (scope `copy`) | yes |
| suspend_sharing | `social_restriction` for 7 d, 30 d or permanent | yes |
| ban | better-auth ban (sessions revoked) | yes, by email |

The statement is one text (`statementText`): what, how long, the facts (reason plus the admin's
note), the rule in the terms, that it followed a notice, and how to contest. It goes by email with
reply-to `notices@lesefluss.app` and as a `statement_of_reasons` inbox item with the same text in
`payload`. Inbox items from Lesefluss have `actor = null`.

The notifier gets a `notice_decision` inbox item (in-app) or a decision email (web form); neither
names the reported user's other data, and nothing anywhere names the notifier to the reported user.

## Repeat offenders

After an action, `countActionedNotices` counts upheld notices against the user in the window
(open and rejected never count). At the threshold, with no active suspension, a permanent
`sharing_suspended` restriction with `created_by = auto` is added and its text is appended to the
same statement. An admin lifts it from the queue after review.

## Retention and deletion

Closed notices: 24 months after the decision. Takedown records: kept (they are what keeps a removed
book removed). On account deletion (`purgeUserSyncData`): the user's restrictions are deleted and
their identity is nulled on notices they filed; notices about them and takedown records stay.
