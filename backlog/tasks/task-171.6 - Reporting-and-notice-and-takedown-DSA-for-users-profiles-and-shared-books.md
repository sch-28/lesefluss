---
id: TASK-171.6
title: 'Reporting and notice-and-takedown (DSA) for users, profiles and shared books'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-25 22:11'
updated_date: '2026-10-02 16:58'
labels:
  - social
  - web
  - app
  - legal
dependencies:
  - TASK-171.1
  - TASK-171.2
  - TASK-171.4
  - TASK-171.5
documentation:
  - backlog/decisions/ADR-0004-friends-only-book-sharing.md
  - 'https://eur-lex.europa.eu/eli/reg/2022/2065/oj'
parent_task_id: TASK-171
priority: high
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Once users can share books and show profiles to their friends, Lesefluss is a hosting provider for user content under the EU Digital Services Act. ADR-0004 makes a working notice-and-takedown process a precondition for book sharing going live. This subtask builds the generic process. It is small in code and rarely used, but it has to exist and work.

Who triggers it (with 1:1 private shares and friends-only profiles a rightsholder rarely sees anything): a recipient reporting an unwanted or abusive share or profile (most likely, often not copyright); a rightsholder or anyone else via the public web form; authorities.

Depends on TASK-171.2 (block), TASK-171.4 (inbox for outcomes), TASK-171.5 (profile screens that host the report entry point) and TASK-171.1 (handle reset and avatar removal service functions). Later subtasks plug into it: TASK-171.7 adds the "received share" entry point, the "every copy of this origin" takedown scope and share revocation; TASK-171.9 adds buddy-read comments and shared highlights; TASK-61 adds profile and feed shared highlights. Each reuses these notice records and flows.

Scope:
- **Notice mechanism (DSA Art. 16)**:
  - In-app "Report" on another user's profile: in the overflow menu of the TASK-171.5 profile screen and of friend rows and incoming requests in the TASK-171.3 Social tab. The same report flow component is reused by later entry points (received share, comment, shared highlight). Reasons: copyright, harassment/abuse, illegal content, spam, other; free text up to 2,000 characters. The flow offers to block the user too (TASK-171.2). Users cannot report themselves. Offline shows an error and keeps the draft open for retry, no queueing. Success shows a toast.
  - Public web form at `/report` on `apps/web`, linked from the imprint (`routes/imprint/index.tsx`) and the footer legal links in `routes/__root.tsx`. DSA Art. 16 requires that anyone can notify, so it works signed out. Collects what Art. 16(2) requires: explanation, exact location (for a profile, the handle; for a share, sender handle plus book title; for a highlight or comment, the handle and book), notifier name and email, and a required good-faith checkbox. Inline validation, a success page and a retryable error state. Spam protection as in `routes/api/feedback.ts`: honeypot, streamed body size cap, per-IP bucket via `getClientKey` plus a global bucket.
  - Receipt confirmation to the notifier (email for the web form, toast in app), and an alert email for every new notice to a fixed notices address (a constant like `FEEDBACK_TO`).
- **Notices store** with an extensible set of target types (profile and shared book here; comment and shared highlight added later), each registering how it is referenced, snapshotted, shown in the queue and taken down. A profile target is referenced by handle. Fields: notifier (user id, or name + email), target type and reference, a text snapshot at report time (profile: handle, display name, bio; share: sender, title, author, origin, never book content; text items: the text and note as reported, since authors can edit or delete them), reason, text, status (open / actioned / rejected), handler, timestamps, decision note, email delivery state. Closed notices are kept 24 months after the decision, then deleted.
- **Admin queue** under `apps/web/src/routes/_authenticated/admin` (gated by `role === "admin"` in `beforeLoad` and `requireAdminSession` in `lib/admin.ts`): open notices first, oldest first, with age; filter by status, target type and reason; view the target in context (for books: metadata and a bounded content excerpt); act.
- **Actions**: remove bio or avatar; force-reset a handle; take down a book (the reported copy; TASK-171.7 adds the origin-wide scope); suspend sharing (7 days, 30 days, or permanent); ban via better-auth; lift a suspension or ban; reject the notice.
- **Statement of reasons (DSA Art. 17)** to the affected user on every restriction (for a book takedown: the sender), by email (`sendMail`, reply-to the notices address) and inbox item: what was restricted, for how long, the facts, the rule in the terms, that it was based on a notice, and how to contest (reply email, and the courts). It never names or identifies the notifier. A rejected notice tells the reported user nothing.
- **Notifier outcome**: the decision and how to contest it, by email for web-form notifiers and by inbox item for in-app reporters.
- **Repeat offenders**: 3 actioned notices against the same user within 180 days suspend their sharing automatically until an admin reviews it; this counts as a restriction and sends a statement of reasons. Open or rejected notices never count. Keep both numbers in one constant.
- **Sharing suspension** covers book sharing (TASK-171.7), buddy-read invites and copy delivery (TASK-171.8) and highlight sharing (TASK-61); each of those flows calls `isSharingSuspended` and shows the suspended user why. Friends never learn of it.
- **Legal and docs**: terms (`routes/terms/index.tsx`) get content rules for sharing, profiles and shared text; the imprint gets a contact point for notices and authorities (Art. 11/12); the privacy policy covers notice data, the snapshot and the 24-month retention. A Backlog document "Moderation runbook" covers handling a notice, the actions, resending mail and the Art. 18 duty to inform authorities of suspected threats to life or safety. Add "notice", "takedown" and "sharing suspension" to `CONTEXT.md`.

Out of scope: automated scanning, hash-matching, transparency reports (small-enterprise exemption, confirm with legal), an internal complaint system (DSA Art. 20 applies to online platforms; contest by reply email).

Implementation notes (verified against the code):
- Tables in `apps/web/src/db/schema.ts` with a migration in `apps/web/drizzle/`: `social_notices`, `social_restrictions` (user id, kind such as `sharing_suspended`, nullable `until` for permanent, reason, notice id, created by, lifted at) and `social_takedowns` (removal record: scope `copy` or `origin`, the removed `(userId, bookId)` rows, origin user id + book id for `origin` scope, notice id). These deliberately have no FK to `user`: notices and removal records must outlive the account for their retention period. Do not use `user.banned` for suspension: a ban blocks sign-in and sync; it is only for "ban user".
- Export `isSharingSuspended(userId)` and `isOriginTakenDown(originUserId, originBookId)` (true when an `origin`-scope removal record exists) from `apps/web/src/lib/`. An expired suspension counts as lifted without a job.
- Book takedown: a function `takeDownBooks(tx, rows, noticeId, scope)` that reuses the `deleteAdminBook` write (`deleted = true`, content/cover/chapters nulled, `updatedAt = now`, highlights tombstoned) and always writes a `social_takedowns` row. The sync push in `api/sync.ts` refuses to recreate or revive a removed `(userId, bookId)`, which keeps working after `hardDeleteAdminTombstones` or `clearCloudData` deletes the tombstone. TASK-171.7 calls the same function for the origin scope.
- In-app report: a file route under `apps/web/src/routes/api/` with `middleware: [cors, requireAuth]`, called through TASK-171.1's authed-fetch helper, rate-limited with `checkLimit` keyed `report:${userId}`. The public form posts to an unauthenticated route like `api/feedback.ts`; a handle typed into it is resolved to the user server-side and never confirms to the notifier whether it exists. Admin actions are `createServerFn` functions (`lib/admin.ts` or `lib/admin-notices.ts`) that start with `requireAdminSession()`.
- Ban: no ban UI exists. Use `auth.api.banUser` with the admin's headers (it revokes sessions, so native bearer tokens get 401 on the next sync) and `auth.api.unbanUser`.
- Admin content view: books can be up to `MAX_SYNCED_CONTENT_BYTES` (20 MB). Return metadata and a bounded excerpt, never the full `content` column.
- Mail: `sendMail` throws on a Resend error. A failed email must not roll back the admin action; record delivery and allow resend. The receipt goes to an address the submitter typed, so rate-limit per recipient address and never echo their free text into it. Escape user text in admin HTML, as `feedback.ts` does.
- Handle reset and avatar removal call TASK-171.1's service functions: the reset handle goes into the 90-day hold without reclaim and the user must pick a new one; the stored avatar image is deleted.
- Inbox types added here: statement of reasons and notice decision. Neither ever identifies the notifier.
- Account deletion: in `purgeUserSyncData` (reached by all three paths once TASK-171.1 switched `deleteAdminUser`), null the notifier's name and email on their notices and delete the user's `social_restrictions`; keep notices and removal records. No scheduled jobs exist in `apps/web`; purge expired notices on admin queue load.
- `checkLimit` is in-memory per process; compute the repeat-offender count from Postgres.
- Older app builds have no report action; the web form is their fallback. Nothing here changes the sync payload.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A signed-in user can report another user's profile from the profile screen and from the Social tab's friend and incoming-request menus, choosing a reason and adding text, and can block that user in the same flow
- [x] #2 A user cannot report themselves, and an offline report attempt shows an error without losing the entered text
- [x] #3 Anyone without an account can submit a notice at /report with explanation, content location, name, email and a good-faith confirmation; a submission missing any of these is rejected with an inline error
- [x] #4 The /report page is linked from the imprint and the footer legal links, and a profile is identified on it by handle
- [x] #5 The web form and in-app reporting are rate-limited per IP, per user and per receipt address, and honeypot submissions are dropped
- [x] #6 Every new notice sends an alert email to the notices address, and the receipt email to the notifier never contains their submitted free text
- [x] #7 Every notice is stored with status and a text snapshot of the target, and is visible to admins in a queue filterable by status, target type and reason
- [x] #8 A later subtask can add a report target type (with its reference, snapshot, queue view and takedown action) without changing the notices schema
- [x] #9 An admin can reject a notice or act on it: remove bio or avatar, reset handle, take down a book, suspend sharing for 7 days, 30 days or permanently, ban, and lift a suspension or ban
- [x] #10 A handle reset puts the old handle into the 90-day hold without reclaim and requires the user to pick a new handle; removing an avatar deletes the stored image
- [x] #11 The book takedown tombstones exactly the targeted row with content nulled and its highlights tombstoned, and writes a removal record, verified with a fixture book row
- [x] #12 A book removed by takedown stays removed: a device that was offline during the takedown cannot restore it by pushing it again, including after the admin tombstone cleanup or Clear cloud data
- [x] #13 The affected user receives a statement of reasons by email and inbox for every restriction, stating what, how long, why, the rule and how to contest, and never identifying the notifier
- [x] #14 A rejected notice sends nothing to the reported user
- [x] #15 The notifier receives a receipt and the decision, including how to contest it, by email for the web form and by inbox item in the app
- [x] #16 A failed statement-of-reasons or notifier email does not undo the admin action and is visible on the notice so the admin can resend it
- [x] #17 A third actioned notice against a user within 180 days suspends their sharing automatically with a statement of reasons; open and rejected notices do not count
- [x] #18 isSharingSuspended returns true during an active suspension and false once a time-limited suspension expires or is lifted, without any job running
- [x] #19 isOriginTakenDown returns true only for origins with an origin-scope removal record
- [x] #20 Closed notices older than 24 months are deleted
- [x] #21 Deleting a notifier's or reported user's account removes their restrictions and the notifier's name and email from notices, while notices and removal records stay until their retention ends, covered in account-deletion.integration.test.ts
- [x] #22 Tests cover notice creation and validation, each admin action, suspension enforcement and expiry, the repeat-offender threshold and the offline re-push after takedown
- [x] #23 Terms, imprint and privacy pages are updated for content rules, the notice contact point, notice data and the 24-month retention
- [x] #24 CONTEXT.md defines notice, takedown and sharing suspension, and a Backlog document Moderation runbook describes handling notices, the actions, resending mail and the Art. 18 escalation to authorities
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation plan

### 1. Core (`packages/core/src/social.ts`)
- `NOTICE_REASONS = ["copyright", "harassment", "illegal", "spam", "other"]`, `NOTICE_TEXT_MAX = 2000`, `NOTICE_TARGET_TYPES = ["profile", "shared_book"]`, Zod `ReportBodySchema { targetType, targetUserId, reason, text, block?: boolean }` for the in-app route, `SOCIAL_API.report`.
- Two inbox types appended to `NOTIFICATION_TYPES`: `statement_of_reasons` (to the restricted user) and `notice_decision` (to an in-app reporter). `InboxItem.actor` becomes `SocialIdentity | null` (null = Lesefluss itself) and gains `payload: { text: string } | null` carrying the composed statement or decision text. Neither type ever carries anything about the notifier.

### 2. Database (`0025_social_notices.sql`)
- `social_notice`: id, status (`open` | `actioned` | `rejected`), `target_type`, `target_ref` (profile: handle; shared book: `userId:bookId`), `target_user_id` (resolved reported user, nullable, no FK), `target_snapshot` jsonb, reason, text, source (`app` | `web`), notifier_user_id / notifier_name / notifier_email (all nullable, no FK), created_at, decided_at, decided_by, decision (action kind), decision_note, `mail_state` jsonb (`statement` and `notifier` delivery: status, error, sentAt). Indexes on `(status, created_at)` and `(target_user_id, decided_at)`.
- `social_restriction`: id, user_id, kind (`sharing_suspended`), until (null = permanent), reason, notice_id, created_by (admin id or `auto`), created_at, lifted_at, lifted_by. Index `(user_id, kind)`.
- `social_takedown`: id, scope (`copy` | `origin`), user_id, book_id, origin_user_id, origin_book_id, notice_id, created_at; unique `(user_id, book_id)` so the sync check is one indexed lookup.
- `social_notification`: `actor_id` nullable, new `payload` jsonb. No FKs to `user` on the three new tables so records outlive accounts.

### 3. Server library (`apps/web/src/lib/moderation/`)
- `targets.ts`: registry `NOTICE_TARGETS[type] = { label, resolve(ref) → { targetUserId, targetRef, snapshot } | null, summarise(snapshot), actions }`. Profile resolves a handle to the user and snapshots handle, display name, bio. Shared book parses `@handle` plus title, resolves the owner and the first live book with that title, snapshots owner handle, title, author (never content). Later types register here only (AC #8).
- `notices.ts`: `createNotice(input)` (in-app: self-report → `invalid`; target must be socially visible, else `not_found`; optional block runs `blockUser` in the same request), `createWebNotice(input)` (unresolved location keeps `target_user_id` null and the raw location as ref), `listNotices(filter)` with open-first, oldest-first ordering and a purge of closed notices older than 24 months, `noticeContext(id)` (profile fields, or book metadata plus a 2,000-character excerpt). Alert mail to `NOTICES_TO = "notices@lesefluss.app"` on every notice; receipt mail to a web notifier without their free text, rate-limited per address (3/day).
- `takedown.ts`: `tombstoneBook(tx, userId, bookId, now)` (extracted from `deleteAdminBook`, which then calls it) and `takeDownBooks(tx, rows, noticeId, scope)` writing one `social_takedown` row per book. `isOriginTakenDown(originUserId, originBookId)`. `filterTakenDown(tx, userId, bookIds)` used by the sync push to drop removed `(userId, bookId)` rows before the upsert, so a re-push after tombstone cleanup or Clear cloud data never revives them.
- `restrictions.ts`: `suspendSharing(tx, userId, { until, reason, noticeId, createdBy })`, `liftRestriction(id, adminId)`, `isSharingSuspended(userId, now)` (active = not lifted and until null or in the future; expiry needs no job), `REPEAT_OFFENDER = { count: 3, windowDays: 180 }`, `countActionedNotices(userId, since)`.
- `decide.ts`: `decideNotice({ noticeId, adminId, action, note, duration }, deps)`. Actions: `reject`, `remove_bio`, `remove_avatar` (`removeAvatar`), `reset_handle` (`forceResetHandle`), `take_down_book`, `suspend_sharing` (7 d, 30 d, permanent), `ban` (`auth.api.banUser` via a dependency so tests can stub it; `unban` likewise). One transaction performs the action and closes the notice; afterwards the repeat-offender rule may add an automatic suspension (`created_by = auto`, its own statement), then mails go out: statement of reasons to the affected user (what, how long, facts, terms rule, based on a notice, how to contest by replying or in court; reply-to the notices address) plus a `statement_of_reasons` inbox item, and the decision to the notifier (mail for web notices, `notice_decision` inbox item for in-app reporters). A reject sends nothing to the reported user. Mail failures are caught and written to `mail_state`; `resendNoticeMail(noticeId, which)` retries.
- `mailer.ts` gains optional `replyTo`. Mail templates in `moderation/mail.ts` with all user text escaped.
- `lib/admin-notices.ts`: `createServerFn` wrappers (`getNotices`, `getNoticeContext`, `decideNotice`, `resendNoticeMail`, `liftRestriction`, `unbanUser`, `getRestrictions`) starting with `requireAdminSession()` (exported from `admin.ts`).
- Routes: `api/report.ts` (public, honeypot `company`, capped body, per-IP 5/h and global 50/h buckets, Zod validation with field errors), `api/social/report.ts` (`cors` + `requireAuth`, `report:${userId}` 10/h).
- `account-deletion.ts`: null notifier id, name and email on the user's notices; delete their restrictions; notices and takedowns stay.
- Inbox: `visibleItems` accepts a null actor; `listInbox` returns `actor: null` and `payload`.

### 4. Web UI
- `/report` page (`routes/report/index.tsx`): target type, location (handle, or handle plus title), explanation, name, email, good-faith checkbox, honeypot, inline errors, success state, retryable error. Linked from the footer legal links and the imprint.
- Admin: `routes/_authenticated/admin/notices.tsx` (gated like `admin/index.tsx`, linked from it): queue with age, filters for status, target type and reason; detail panel with snapshot, live context, action picker with note and duration, mail state with resend, restrictions list with lift, unban.
- Legal: terms get a "Content rules and enforcement" section (sharing, profiles, shared text, the restrictions we may apply, statement of reasons, how to contest); imprint gets "Notices under the Digital Services Act" (single contact point for users and authorities: notices@lesefluss.app and /report, English and German); privacy covers notice data, the snapshot, the 24-month retention and statement mails.

### 5. App
- `services/social/report.ts`: `useReportUser` posting `SOCIAL_API.report` (invalidates relationships when blocking).
- `components/social/report-sheet.tsx`: drawer with reason list, text (2,000 max, counter), "Also block" switch, submit; errors shown inline and the draft kept; success toast. Opened from the profile overflow menu and from friend and incoming-request menus on the Social tab. Own profile has no report action.
- Inbox: null actor renders "Lesefluss"; `statement_of_reasons` and `notice_decision` show `payload.text`.

### 6. Docs and tests
- `CONTEXT.md`: Notice, Takedown, Sharing suspension. Backlog document "Moderation runbook" (handling a notice, each action, resending mail, Art. 18 escalation, retention). `docs/social-moderation.md` for the code layout.
- `moderation.integration.test.ts` (mailer and ban stubbed): in-app notice with snapshot and block, self-report rejected, web notice with unresolved location, alert and receipt mails (receipt has no free text), each action (reject sends nothing to the target; bio, avatar, handle reset into the hold without reclaim; takedown of a fixture book nulls content, tombstones its highlights and writes the record; suspension 7 d / permanent; lift), `isSharingSuspended` expiry by clock, `isOriginTakenDown`, repeat offender (two actioned plus open and rejected do not trigger, the third does, with its own statement), mail failure keeps the action and is recorded, statement and decision inbox items carry no notifier data, retention purge. `sync-book-upsert.integration.test.ts`: taken-down book dropped from a push. `account-deletion.integration.test.ts`: notifier fields nulled, restrictions gone, notice and takedown kept. Route-level validation unit test for the web form parser.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Snapshots and the notifier's text live only in `social_notice`; the alert mail to notices@lesefluss.app is the one place the text is repeated. The receipt to a web notifier carries the reference id and nothing they typed, since the address is unverified and could be someone else's; it is also capped at 3 per address per day.

Statement of reasons: one plain-text block (`statementText`) composed at decision time from the action, the reason label and the admin's note, stored in `mail_state.statement.text` so a resend repeats exactly what was decided, and put verbatim into the `statement_of_reasons` inbox item's `payload`. The repeat-offender suspension appends its own paragraph to the same statement instead of sending a second mail. Inbox items from Lesefluss have `actor_id = NULL` (column made nullable, `payload` jsonb added); `visibleItems` skips the actor checks for them and the app renders a shield with "Lesefluss".

Ban goes through a `BanDeps` dependency (`betterAuthBan`) that imports `~/lib/auth` lazily; the integration test passes a stub, so the moderation suite runs without the OAuth env. `~/lib/mailer` is mocked in the same way (it requires `RESEND_API_KEY` at import).

`onMutualRequest` no longer exists (removed in the 171.4 review); `createFriendship` fires `onRequestRemoved` for the stored request, which is enough. `forceResetHandle` gained a `forceResetHandleWithin(tx, …)` variant so the reset shares the decision transaction. `deleteAdminBook` now calls the shared `tombstoneBook`.

The sync push filters taken-down `(user, book)` rows before the upsert (`takenDownBookIds`); the client is not told, which is acceptable: its local copy stays local, and the tombstone (while it exists) still deletes it on pull. `social_takedown` has a unique `(user_id, book_id)` so the check is one indexed lookup per push.

Web notice locations for a shared book are parsed as "@handle, title" and matched case-insensitively against the owner's live books; a miss keeps the typed location and `target_user_id = NULL`, and such a notice can only be rejected (the admin acts by hand if the target is identifiable). Migration 0025 applied to the dev DB. UI not exercised in a browser or on a device.

## Review pass (five sonnet reviewers, every claim verified by hand)

Confirmed and fixed:
- Sync push dropped taken-down books but not their highlights or book-scoped glossary entries, so an offline device could revive a highlight quoting the removed content. Both are now filtered by the same `takenDownBookIds` set.
- Ban ran inside the decision transaction through better-auth's own connection, so a later failure in the transaction left the user banned with the notice still open. The ban now runs before the transaction (`banBeforeDeciding`), is idempotent, and a re-decision bans again without harm.
- Report entry points were unreachable offline: the "More" buttons on the profile and in the Social tab were disabled while offline, so the offline-error-keeps-draft path could never be hit. The menus now open offline; only Remove, Block and Decline-and-block are disabled there.
- Receipt mail could be used to mail an arbitrary address three times a day indefinitely; the per-address cap is now 3 per 30 days.
- `block: true` on a report bypassed the block endpoint's budget; the report route now consumes the same `social-block` bucket.
- Admin "Now" view for a profile notice re-resolved by handle, which can move to another person; it resolves by the stored user id first.
- Banned or handle-less users could not be reported in-app (their content may be live); the visibility check is now existence only.
- `WebNoticeBodySchema.name` lacked the control/bidi-character filter the other text fields have.
- Privacy page claimed removal records expire with notices; they are kept for good (they are what keeps a removed book removed). Wording fixed; comment on `socialNotification` notes that actor-null rows never collapse on the event index.
- `ModerationError` codes `invalid`/`unsupported` mapped to 409; now 400 (409 only for `closed`), matching `SocialError`.
- Stale comment left in `deleteAdminBook` after the extraction; duplicated `escapeHtml`/body-cap code between `feedback.ts`, `report.ts` and `mail.ts` moved to `lib/public-form.ts`; form field messages and target labels moved to `lib/moderation/web-form.ts` (one place for a new target type besides the registry) with unit tests for `readBodyCapped` and `fieldErrors`.
- `suspensionUntil` treated any unknown duration as 30 days; `isSuspensionDuration` guard added.
- Admin page: Lift and unban disabled while pending and surface errors; Resend shown only for failed mail; `ReportSheet` resets when the target changes; web form keeps the location hint visible, clears the location on type change, wires the reason error and the checkbox error's aria attributes; inbox no longer runs "Lesefluss" into the statement text.
- Repeat-offender test restores the handle and lifts suspensions in `finally`.

Not changed: `shared_book` in-app reports accept any `(user, book)` pair the reporter names (no share records exist yet; TASK-171.7 must require one). Order-dependent moderation tests (sequential by design). Correctness reviewer confirmed transaction boundaries, lock, repeat-offender ordering and the rest.

Verification after fixes: web 115/115 on a fresh migrated database, core 121/121, capacitor 662/662, type-checks and biome clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Reporting and notice-and-takedown (DSA)

### What changed
- **Core**: `NOTICE_REASONS` with labels, `NOTICE_TARGET_TYPES` (`profile`, `shared_book`), text limits, `ReportBodySchema` (in-app) and `WebNoticeBodySchema` (public form), `SOCIAL_API.report`; inbox types `statement_of_reasons` and `notice_decision`; `InboxItem.actor` nullable and `payload: { text }`.
- **Database** (`0025_social_notices.sql`): `social_notice` (status, target type/ref, resolved user, jsonb snapshot, reason, text, source, notifier fields, decision, `mail_state`), `social_restriction` (sharing suspension with `until`, `lifted_at`, `created_by`), `social_takedown` (scope copy/origin, unique per user+book); no FKs to `user`. `social_notification.actor_id` nullable plus `payload`.
- **Server** (`lib/moderation/`): target registry (`targets.ts`), `createNotice` / `createWebNotice` / `listNotices` with 24-month purge (`notices.ts`), `decideNotice` with reject, remove bio, remove avatar, reset handle, take down book, suspend sharing (7 d / 30 d / permanent) and ban, repeat-offender rule (`REPEAT_OFFENDER = { count: 3, windowDays: 180 }`), statement of reasons by mail (reply-to notices@lesefluss.app) and inbox, notifier decision by mail or inbox, mail results recorded with `resendNoticeMail` (`decide.ts`); `isSharingSuspended`, `liftRestriction` (`restrictions.ts`); `tombstoneBook`, `takeDownBooks`, `takenDownBookIds`, `isOriginTakenDown` (`takedown.ts`); templates in `mail.ts`; `sendMail` gained `replyTo`. Routes `POST /api/report` (public, honeypot, body cap, per-IP and global buckets, field errors) and `POST /api/social/report` (cors + requireAuth, 10/h). Sync push drops taken-down books. Account deletion nulls the notifier identity and deletes restrictions.
- **Web UI**: `/report` page linked from the footer and the imprint; `/admin/notices` queue (filters, age, snapshot and live context, actions with note and duration, mail state with resend, restrictions with lift, unban) linked from the admin page; terms "Content rules and enforcement", imprint "Notices under the Digital Services Act" (single contact point, EN/DE), privacy "Notices and moderation".
- **App**: `ReportSheet` (reasons, text with counter, "Also block", inline error keeping the draft, success toast) from the profile menu and the Social tab's friend and incoming-request menus; inbox renders Lesefluss items with the statement text.
- **Docs**: CONTEXT.md Notice, Takedown, Sharing suspension; `docs/social-moderation.md`; Backlog document "Moderation runbook" (doc-3).

### Tests
- `moderation.integration.test.ts` (11): in-app notice with snapshot, self-report rejected and block in the same request; web notice resolving a handle, unresolved location kept as typed, receipt without free text, unresolved notice only rejectable; reject sends nothing to the target and a decision item to the reporter; bio removal with statement by mail and inbox never naming the notifier; failed mail recorded and resent; repeat offender (open and rejected do not count, third upheld suspends with an appended statement); timed suspension expiry by clock and lift; book takedown (content nulled, highlights tombstoned, record written, re-push refused after the tombstone is gone); `isOriginTakenDown`; ban via dependency and queue order; 24-month purge. `sync-book-upsert` (+1 taken-down push), `account-deletion` (moderation rows), core `social-notice.test.ts` (schema validation). Web 111, core 121, capacitor 662 green; type-check and lint clean.

### Follow-ups
- TASK-171.7 registers the received-share entry point, the `origin` takedown scope and calls `isSharingSuspended`; TASK-171.8 and TASK-61 call it too. UI not run in a browser or on a device.
<!-- SECTION:FINAL_SUMMARY:END -->
