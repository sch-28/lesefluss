---
id: TASK-117
title: Share reading stats with friends and as a stats card
status: To Do
assignee: []
created_date: '2026-05-01 01:43'
updated_date: '2026-10-02 16:58'
labels:
  - social
  - app
milestone: m-14
dependencies:
  - TASK-171.1
  - TASK-171.5
priority: low
ordinal: 10500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Part of the social workstream (parent TASK-171). Readers like to show off: "42 books this year, 1.2 M words, 5 h 20 min read". Let them pick which reading stats appear on their profile, and export a stats card image.

Depends on TASK-171.5, which owns the profile stats section, the server-side stats helper keyed by a target `userId`, the hide-from-profile flag and the move of the pure stats pieces into `@lesefluss/core`. The "reading stats" section toggle itself lives in TASK-171.1's per-user social settings row (`social_profile`), which this task extends. Who may see the stats section (self or friend; strangers and blocked users never do) is decided entirely by TASK-171.5's resolver, since profiles are friends-only (ADR-0004); this task only narrows which stats the section contains. The stats page is `apps/capacitor/src/pages/library/stats.tsx` (route `apps/capacitor/src/routes/tabs/library/stats.tsx`); its numbers come from `apps/capacitor/src/services/db/queries/stats.ts` and `apps/capacitor/src/services/stats/*` (the TASK-159.x subtasks, all Done). TASK-160 (web account dashboard stats) is still To Do and is not a data source for this task.

Scope:
- **Profile stat selection**: the owner chooses which stats appear on their profile (books finished, words read, reading time, reading speed, current streak) and the period (this year, all time). Stored server-side on the TASK-171.1 settings row; the profile view API (TASK-171.5) returns only the selected stats, so unselected values never leave the server. The existing "reading stats" section toggle still gates the whole section, and an empty selection hides the section the same way the toggle does. Default selection: books finished and words read, this year. Streak is never on by default, because a friend watching it can tell on which days you did not read.
- **Where it is edited**: in the TASK-171.1 visibility settings screens (app on native and web build, and the website account page), directly under the "reading stats" toggle. It needs sign-in; the screen reuses TASK-171.1's loading, offline/error-with-retry and no-handle states and shows a live example of the stats section with the current selection.
- **Stats card export**: from the stats page, a "Share" action opens a preview of the card for a chosen period (this month, this year, all time) with the chosen stats and Lesefluss branding. The preview shows exactly the image that will be shared. On native it goes to the OS share sheet; on the web build it downloads (or uses the Web Share API with files when `navigator.canShare({ files })` is true). The card is built entirely from local SQLite, so it works offline, without an account and does not depend on `syncStats`. The card's stat choice is independent of the profile selection and is remembered on the device.
- **What the card contains**: stats and period only. It carries no handle, display name, avatar or book covers in this first cut, and no book titles unless the user turns on "Show book titles" (off by default, remembered on the device). With titles on, the card lists up to three books finished in the period, most recent first, with serial chapters rolled up to their series title.
- **Empty period**: if the chosen period has no reading activity, the preview says so and the share action is disabled instead of producing a card of zeros.
- **Year in review (optional, not required by the AC)**: a yearly card with top books, total words and fastest book (`summariseRecords` in `apps/capacitor/src/services/stats/records.ts` already computes `fastestBook` and `longestBookFinished`). Titles follow the same opt-in.
- **Privacy policy** (`apps/web/src/routes/privacy/index.tsx`): add that the owner chooses which aggregate stats their profile shows to friends, and that the device time zone is stored with that choice only to compute period and streak boundaries and is never shown to other users. The card needs no policy text because nothing is sent to the server.

Out of scope: rendering the profile stats section, the visibility matrix and the server stats helper (TASK-171.5), sharing highlights (TASK-61), activity feed (TASK-171.10), the website account dashboard (TASK-160), handle or avatar on the card.

Implementation notes:
- **Periods do not exist yet.** The stats page only has `today`, `7d`, `30d` and `all` (`apps/capacitor/src/pages/library/stats/period.ts`, `PERIODS`/`periodWindow`). "This month" and "this year" are new windows. Compute them in device-local time with `startOfLocalDay`-style helpers from `apps/capacitor/src/utils/date-utils.ts`, and feed them to the existing `getPeriodTotals(start, end)` so card totals match what the page would show for the same window. Either extend `Period` or keep card periods separate, but do not change the page's existing windows.
- **Reading speed has no single headline number today.** The page shows per-mode trends (`buildWpmTrend`) and `summariseReadingRates` returns per-mode rates, not one average. `wpm_avg` on RSVP sessions is the dial target, not measured speed. Define one measured "words per minute" as words over active time across plausible sessions (`isPlausibleRate`, `MAX_PLAUSIBLE_WPM` in `aggregate.ts`), put that function in the shared stats module from TASK-171.5 so card and profile use the same definition, and label it "reading speed", never "average WPM".
- **Owner time zone (decided).** `summariseStreak` buckets by device-local day, and TASK-171.5 computes "this year" in UTC. To make profile numbers match the device, the app sends the device's IANA time zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) whenever the user saves the selection, and the server helper uses it for "this year" and streak boundaries; without a stored zone it falls back to UTC. The server validates the zone name and rejects unknown ones. The settings screen shows which time zone is in use. The zone is never returned by the profile view API or any other social response.
- **Profile totals only see synced data.** Sessions reach the server only when `syncStats` is on (`apps/capacitor/src/services/sync/index.ts`), and oversized books are local-only (ADR-0003). In the stat selection UI, show a note when `syncStats` is off that time, speed and streak cannot appear on the profile. Books hidden from the profile are excluded from the totals, as TASK-171.5 requires, so the profile can legitimately be lower than the app's stats page.
- **Storage and rollout.** The selection (stat keys, period, time zone) is stored on TASK-171.1's `social_profile` row with a migration in `apps/web/drizzle/`. A missing row or missing column means the default selection, with no backfill. The write endpoint accepts only known stat keys and periods, rejects anything else, and reuses TASK-171.1's per-user rate limit for settings writes. It is not part of the sync payload, so older app versions are unaffected. Read and write it through the same CORS API TASK-171.1 uses (bearer on native, cookie on the web build). It is removed with the settings row when the account is deleted (`apps/web/src/lib/account-deletion.ts`) and survives "clear cloud data", like the rest of the row.
- **Rendering the card.** The app has no image-rendering library. Draw on a `<canvas>` with the 2D API to avoid a dependency; wait for `document.fonts.ready` before drawing. No covers are drawn, which also avoids a cross-origin catalog cover tainting the canvas and making `toBlob` throw. Serial chapters roll up to their series title (`rollUpWorks`).
- **Handing the image off.** Reuse the pattern in `apps/capacitor/src/services/export/index.ts`: on native write the PNG to `Directory.Cache` with `Filesystem.writeFile` (base64 data, no `encoding`; the existing `shareFile` helper writes UTF-8 text only), then `Share.share({ files: [uri] })`; on the web build use a Blob download like `downloadBlob`. Handle the user cancelling the share sheet without showing an error.

Docs: note the new stat definition ("reading speed") and the card periods in CONTEXT.md if they introduce terms, and document the stat selection fields and time-zone handling next to the profile API docs from TASK-171.5.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A signed-in user can choose which stats (books finished, words read, reading time, reading speed, current streak) and which period (this year, all time) appear on their profile, and the choice persists server-side from the native app, the web build and the website account page
- [ ] #2 A user without a saved selection gets books finished and words read for this year; current streak is never selected by default
- [ ] #3 The profile view API returns only the selected stats; unselected stats are absent from the response, not just hidden in the UI
- [ ] #4 An empty selection hides the stats section exactly as turning off the reading stats toggle does
- [ ] #5 The selection endpoint rejects unknown stat keys, unknown periods and invalid time-zone names
- [ ] #6 For a user with syncStats on, all books synced and no books hidden from the profile, profile stats match the numbers the app computes for the same period, with period and streak boundaries in the owner's saved time zone
- [ ] #7 The owner's time zone never appears in the profile view API or any other response about another user
- [ ] #8 When syncStats is off, the selection UI says that time, speed and streak cannot be shown on the profile, and the profile omits them instead of showing zero
- [ ] #9 Reading speed on card and profile uses one shared measured definition (plausible sessions only), is labelled reading speed, and is never the raw wpm_avg column
- [ ] #10 A user can export a stats card image for this month, this year or all time: via the OS share sheet on native and as a download on the web build, offline and without an account
- [ ] #11 The share preview shows the exact image that will be shared, and the share action is disabled with a message when the period has no reading activity
- [ ] #12 This month and this year on the card use device-local calendar boundaries, and card totals equal getPeriodTotals for the same window
- [ ] #13 The card contains no handle, display name, avatar or cover; book titles appear only when the user turns on Show book titles, and serial chapters appear under their series title
- [ ] #14 Cancelling the share sheet does not show an error
- [ ] #15 The privacy policy states that the owner chooses which aggregate stats their profile shows and that the stored time zone is used only for period boundaries and never shown to others
- [ ] #16 Tests cover server-side stat filtering, the default selection, input validation, time-zone boundaries on the server, and card period computation including month and year boundaries and a DST change
- [ ] #17 Developer docs describe the stat selection fields, the reading speed definition and the time-zone handling
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cross-task contracts (from the final review of the TASK-171 set): TASK-171.5 now owns the single measured reading-speed function in `@lesefluss/core` and a server stats helper that accepts an optional owner time zone (UTC fallback). This task reuses both instead of defining them: it stores the zone with the stat selection, passes it to that helper, and uses the same speed function for the card. The stat-selection columns go on TASK-171.1's `social_profile` row, which cascades on account deletion.
<!-- SECTION:NOTES:END -->
