---
id: doc-3
title: Moderation runbook
type: other
created_date: '2026-09-26 18:13'
---
Operating procedure for notices under the EU Digital Services Act (Regulation (EU) 2022/2065). Code: `docs/social-moderation.md`. Legal background: ADR-0004.

## Where notices arrive

- Every new notice sends an alert to notices@lesefluss.app with the notifier's text and the snapshot.
- The queue is at `/admin/notices` (admin role required). It shows open notices first, oldest first, with their age. Filters: status, target type, reason.
- Notices sent by email instead of the form are entered by hand: use the `/report` form yourself with the sender's name and email, or answer by email and treat the mail thread as the record.

## Handling a notice

1. Open the notice. Read the reason, the text, the snapshot (how the target looked when reported) and the live context (how it looks now; a book shows metadata and a 2,000-character excerpt, never the whole text).
2. Decide whether the content is illegal or breaks the terms (section "Content rules and enforcement"). Aim to decide within a few days; copyright and safety notices first.
3. Write the facts in the note field in plain words. The affected user reads this sentence in their statement of reasons. Never mention who reported, how we learned of it beyond "a notice", or anything about the notifier.
4. Pick the action:
   - Reject: nothing is sent to the reported user. The notifier is told we did not act.
   - Remove bio / Remove avatar: the field is cleared; the user may set a new one.
   - Reset handle: the handle goes into the 90-day hold without reclaim; the profile is hidden until the user picks a new handle.
   - Take down book: the reported copy is tombstoned and can never be uploaded again from any device.
   - Suspend sharing: 7 days, 30 days or permanent. Reading and sync continue; friends are not told.
   - Ban: closes sign-in. Only for accounts that cannot stay (repeated illegal content, threats, CSAM). Data stays until the user asks for deletion or the ban is lifted.
5. Submit. The notice closes, the statement of reasons goes out by email and inbox, the notifier gets the decision. Both mail results are shown on the notice.

A notice whose location did not resolve to an account can only be rejected. If the target is identifiable by hand, act through the admin page directly and reject the notice with a note.

## After a decision

- Mail shows "failed": fix the cause (Resend outage, bad address) and press Resend on the notice. The stored statement text is resent verbatim.
- Repeat offenders: the third upheld notice within 180 days suspends sharing automatically (permanent, created by "auto"). Review the account and lift it from the notice or from "Active restrictions" if warranted; otherwise leave it.
- Contest: users contest by replying to the statement email (reply-to notices@lesefluss.app). A different person than the one who decided should review it when possible. Lifting a suspension or unbanning is done from the notice; a removed bio, avatar or handle is restored by the user themselves; a taken-down book cannot be restored.
- Lift: "Active restrictions" at the bottom of the queue lists every current suspension with a Lift button.

## Authorities (Art. 18)

If a notice or anything else gives reason to believe a criminal offence involving a threat to the life or safety of a person has taken place, is taking place or is likely to take place, inform the law enforcement or judicial authority of the member state concerned at once (in Germany: the Polizei or the Bundeskriminalamt for online content) with the relevant data, before or alongside any action on the account. Keep the notice open until that is done and note what was reported to whom.

## Retention

Closed notices are deleted 24 months after the decision (on queue load). Takedown records are kept. Deleting an account removes its restrictions and its identity from notices it filed; notices about it stay.
