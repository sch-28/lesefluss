---
id: TASK-171.14
title: >-
  Social UX pass: navigation, richer screens, buddy-read page with discussion
  tab
status: Done
assignee:
  - '@claude'
created_date: '2026-09-27 13:21'
updated_date: '2026-09-27 14:43'
labels:
  - social
  - app
  - ux
milestone: m-6
dependencies: []
parent_task_id: TASK-171
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A first-glance review by the owner plus three UI/UX reviews (navigation, visual design, flows and copy) found that the Social area works but feels like a settings menu: it reuses the Settings list pattern (small uppercase section header, bordered divide-y rows) for content screens, while Stats and Library use covers, progress visuals, large numbers and motion. This task fixes that before further TASK-171 subtasks build on it.

Decisions (2026-09-27):
- The Social tab is hidden while signed out; discovery goes through the Cloud sync sign-in and onboarding.
- The feature keeps the name "Buddy read" in the UI; the stray "Read together" / "Reading together" labels are unified. Code and database identifiers stay.
- The buddy-read page gets Overview / Discussion tabs on one route; the separate discussion route goes away (deep links redirect).
- One task, done in three phases (A quick fixes, B redesigns, C flows), each device-tested and reviewed.

Findings to address:
- Tab bar badge is positioned against the whole tab cell (`nav-badge.tsx` `right-1/4`), not the icon; the desktop sidebar already wraps icon and badge.
- Social home: the Requests section always shows, even empty; the "Activity" row is a dead placeholder; Blocked users has a top-level section; the own profile is only reachable through Settings.
- Profile: small covers, plain stats grid; no motion; no streak.
- Buddy reads list: text rows with a generic book icon; no cover, progress, participants or pace; the empty state only describes where to go.
- Buddy-read page: text-only header (the cover is already loaded but not shown), finished members are not marked, the discussion hides behind a button; copy like "1,100 words ahead", "2 of 8 people", "behind pace".
- Discussion: the composer dominates the top, its settings use raw checkboxes instead of the app's switches, and spoiler gating is not explained up front.
- Inbox: duplicated "Inbox" title; answered invites stay as clutter; the moderation notice tells the user to "reply to this email" inside the app.
- "Add friend" means instant friendship on the invite page but a friend request in the buddy-read participant menu.
- Back navigation is `history.back()` everywhere, so deep links from the inbox or notifications can back out of the app instead of to the parent.
- No way to start a buddy read from Social; onboarding never mentions Social; "Social profile" sits under "Devices & sync" in Settings.

Out of scope: the reader's position-rewind bug near the end of a book (tracked in TASK-172), push notifications (TASK-171.11), the friend activity feed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The Social tab and its badge are hidden while signed out or when sync is disabled; signing in shows them without a restart, and deep links into Social while signed out lead to sign-in
- [x] #2 The unread badge sits at the top-right corner of the Social icon on mobile and desktop
- [x] #3 The Social home shows the user's own card at the top (linking to their profile), requests only when some are pending, friends, and buddy reads with a preview of active ones; the dead Activity row is gone and Blocked users moved behind a header menu
- [x] #4 Profiles use cover shelves and stat tiles consistent with the Stats page, including a reading streak when the owner shows stats
- [x] #5 The buddy-reads list shows cards with cover, own progress, other participants and pace, and has a Start a buddy read action that picks a book and opens the start sheet
- [x] #6 The buddy-read page has a cover header, a progress view of all participants with finished members marked, and Overview / Discussion tabs; the old discussion URL redirects to the Discussion tab
- [x] #7 The discussion tab explains spoiler gating up front, keeps the composer compact, and uses switches for its settings
- [x] #8 Inbox: single title, answered invites are de-emphasised or collapsed, and the moderation notice copy fits the in-app channel
- [x] #9 Copy: one name (Buddy read) everywhere in the UI; "Send friend request" where a request is sent; calmer pace wording; no word-count jargon
- [x] #10 Back from a deep-linked Social page goes to its logical parent
- [x] #11 Onboarding and the Cloud sync screen mention Social; Social profile settings are no longer under Devices & sync
- [x] #12 Every changed screen handles loading, empty, offline and error states, works in light and dark themes, and was checked on a device
- [x] #13 App tests and typecheck pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Plan

Reader files (`pages/reader/*`) are being reworked in TASK-172 in parallel; this task does not touch them.

### Phase A: quick fixes (app only)
1. **Tab visibility**: `nav-items.ts` filters Social out unless `isLoggedIn && SYNC_ENABLED` (TabBar and DesktopSidebar both read it). The Social routes keep the signed-out gate, so deep links still land on the sign-in explainer.
2. **Badge**: in `TabBar.tsx`, wrap icon and `NavBadge` in a small `relative` box, as `DesktopSidebar.tsx` already does, and position the badge at the icon's corner.
3. **Social home** (`pages/social/index.tsx`): Requests section only when incoming or outgoing requests exist; remove the Activity placeholder; move Blocked users into a header "…" menu (with "Profile settings"); the Inbox row subtitle becomes "Updates and invites".
4. **Copy**: "Read together" / "Reading together" become "Buddy read(s)"; the participant menu's "Add friend" becomes "Send friend request"; pace wording calmer ("on track" / "a bit behind"); drop "N words ahead" in favour of percent and "ahead of you" / "behind you"; "2 of 8 people" becomes "2 readers".
5. **Discussion settings**: switches (the component the Settings pages use) instead of raw checkboxes; a one-line spoiler explainer.
6. **Inbox**: remove the duplicated section title; answered invites shown compact (single line, muted, no book card). Check the moderation notice text: `moderation/mail.ts` is already channel-neutral, so the old item on the test device predates that fix; confirm with a fresh notice.
7. **Settings**: move "Social profile" out of "Devices & sync" into its own "Social" group.

### Phase B: redesigns
1. **Shared pieces** (`components/social/`): `BookCover` usage with the stats treatment (aspect 2/3, rounded, gradient), `AvatarStack` (overlapping `SocialAvatar`s with "+N"), `ProgressBar` with a finished state (emerald plus check, like `book-stats-card.tsx`), `motion.section` wrappers as in `stats/*`.
2. **Social home**: a "Me" card at the top (avatar, name, handle, currently-reading count; links to the own profile); Requests (conditional); Buddy reads preview (up to 3 active cards plus "See all" and "Start a buddy read"); Friends list; Inbox row with the unread count.
3. **Profile** (`pages/social/profile.tsx`): hero header; a horizontal cover shelf for currently reading (with progress) and finished (reuse or adapt `stats/book-shelf.tsx`); stat tiles like `stats/records-card.tsx` with `tabular-nums` and animated numbers; a reading streak (current and longest). The own profile shows an Edit button.
   - Server: `apps/web/src/lib/social/profile-stats.ts` computes the streak from `sync_reading_sessions` (days with a session, in the user's time zone as stored, same rule as the app's `queries/stats.ts`), behind the existing "Reading stats" visibility switch; `ProfileStats` in core gains `currentStreakDays` and `longestStreakDays`; integration test.
4. **Buddy reads list** (`pages/social/buddy-reads.tsx`): cards with cover (local book via `myBookId`), title and author, own progress bar, an avatar stack of the other members, and pace or "finished" status; finished reads as a compact shelf.
   - Server: `BuddyReadSummary` gains `members: { identity, percent, finished }[]` (visible members only, same visibility rules as the detail) so the list needs no extra requests; test.
5. **Buddy-read page** (`pages/social/buddy-read.tsx`): a cover hero with title, author, host, target date and pace, and actions (Open reader, Invite); **Overview / Discussion** tabs (the tab kept in the URL search, `?tab=discussion`).
   - Overview: participant progress (bars with avatars, sorted by progress, finished marked, "you" highlighted), host controls (invites, target date), Leave.
   - Discussion: the current discussion content moved into a component, with a compact composer (collapsed "Write something…" field that expands), the spoiler explainer and the hidden count, and settings behind a small menu.
   - The route `buddy-read-discussion.$id` redirects to `buddy-read/$id?tab=discussion`; the inbox and the reader thread sheet link there.

### Phase C: flows
1. **Start a buddy read from Social**: a book picker sheet (library books that are not in a running buddy read) that opens the existing `StartBuddyReadSheet` from `book-buddy-read.tsx`.
2. **Back navigation**: `PageHeader` takes an optional `backTo` (route plus params), used when there is no in-app history (deep link or cold start); the discussion goes back to its buddy read, a buddy read to the buddy-reads list, a profile to Social.
3. **Onboarding and sign-in**: one line about friends and buddy reads in the onboarding sync step and on the Cloud sync screen.

### Verification
- App tests and `pnpm check-types`; web tests on a throwaway DB for the streak and summary changes.
- On the device, light and dark themes: every changed screen in loaded, empty and offline states.
- A review pass after phases A+B and after C.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Progress (2026-09-27)
Phases A, B and C are implemented; waiting for the device test.
- Shared rule: the streak computation moved to core (`streakFromDays`, `previousDayKey`); the app's `summariseStreak` delegates to it, so the stats page and profiles count streaks the same way. Its DST tests still pass.
- Server: `ProfileStats` gains `currentStreakDays` and `longestStreakDays` (in the owner's time zone, null without sessions); `BuddyReadSummary` gains `members` (visible current members with progress and a finished flag).
- App: new `components/social/social-ui.tsx` (SocialSection, ProgressBar, FinishedLabel, AvatarStack, StatTile, CoverShelf), `buddy-read-card.tsx` and `start-buddy-read-picker.tsx`. `shareBlockerFor` and `BUDDY_READ_BLOCKER_TEXT` moved from book-detail into book-buddy-read, so the picker and the book page share them.
- The discussion is `DiscussionPanel` inside the buddy-read page (`?tab=discussion`); the old route redirects there.
- `PageHeader` takes `backTo`, used when there is no in-app history (cold start from a link).
- `Section` has an optional title.
- Tests: web 173, core 130, app 671; typecheck clean.

## Device check (Android, Phone One, dark theme)
Verified on device: tab badge on the icon corner; Social home (own card, buddy-read preview with cover and progress, Friends, Inbox, header menu); buddy-reads list with in-progress and finished cards; book picker and hand-off to the start sheet (not submitted); buddy-read page with cover hero, Readers (sorted, own row highlighted), Overview / Discussion tabs; discussion with explainer, collapsed composer that opens with the keyboard, inline Reply, settings sheet with switches; own profile with cover shelves, stat tiles and streak; inbox with compact answered invites; Settings with the separate Social group.
Found and fixed on device: catalog-cover fallback for buddy-read covers (`useLocalCover`), no percent on finished cards, "1 day" singular, one section header style (SocialSection + ListCard), accent colour on header links (the global `a { color: inherit }` beats Tailwind utilities on the Link itself, so the colour sits on an inner span).
Not checked on device: the signed-out state (would need a sign-out on the shared test phone), light theme (the reader theme is shared with TASK-172's testing), offline states.
The moderation notice on the device predates the channel-neutral text; the server already writes "writing to …" instead of "replying to this email".

## Review pass (2 agents)
- `BuddyReadSummary.originUnavailable` (moved up from the detail type), so a taken-down read shows "This book is no longer available" in the list instead of looking like a solo read.
- The profile streak uses the same explicit `dayOf` formatter as the finished-on dates (moved into profile-stats).
- Buddy-read cards override your own progress with this device's local position, like the detail page.
- `CommentDraft` autofocus is opt-in: inline drafts take the keyboard, while the reader's composer sheet leaves focus to the drawer.
- `Section` renders no empty heading when it has only an action.
- The Discussion tab falls back to Overview when the book was taken down.
- Tests: app 671, core 130, web 173; typechecks clean.

## Review pass (4 agents, verified)
Accepted and fixed:
- Back fallback used `router.history.replace` with a bare path, which drops the `/app` basepath on the web build; it now uses `router.navigate({ to, replace: true })`, and `backTo` is typed as a route.
- The Social tab popped in on every cold start while the session was restoring. `useNavItems` now uses the last known signed-in state (localStorage hint, written once the session is resolved) until the restore finishes.
- The Social home showed the "start a buddy read" empty state when loading buddy reads failed; it now says they couldn't load.
- The discussion settings duplicated the Settings page's toggle row; both now use `components/app-shell/toggle-row.tsx`.
Rejected after checking:
- A crash if the app meets a server without `members` or the streak fields: Social is unreleased, and the server ships before the app.
- The picker offering a book that is already in a running buddy read when the list failed to load: the server refuses it with "You already have a buddy read running for this book."
- Deriving "finished" locally at 95%: the server only counts a finish that happens after joining, so a local guess would contradict it; the synced state catches up.
Tests: app 671 and typecheck clean.

## Final device checks
- Server unreachable (adb reverse removed) on a cold start: the Social tab is present from the first frame (signed-in hint) and Social shows "Can't reach the server" with Retry; after the server was back, Retry loaded everything.
- Light theme: Social home, the buddy-read page and the profile render correctly; the theme was set back to Dark afterwards.
- Signed out: the Social tab disappears immediately, and the Cloud sync screen shows the new copy about reading together with friends. After signing in again through the mobile hand-off, the tab and badge come back without a restart.
- During the check the local dev server returned 500 on every request (vite SSR module state after hot reloads, `getRequest is not a function`); a restart fixed it. Not related to this task.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Reworks the Social area so it reads like the rest of the app, not like a settings menu.

Navigation: the Social tab is hidden while signed out, and a remembered signed-in state keeps the tab bar stable during session restore. The unread badge sits on the icon. The Social home leads with your own profile card, shows requests only when pending, a buddy-read preview with Start and See all, friends, and the inbox. Blocked users and profile settings sit behind a header menu. Settings has its own Social group. Back from a page opened from a link goes to its parent (`PageHeader.backTo`, basepath-safe).

Screens: shared building blocks in `components/social/social-ui.tsx` (SocialSection, ListCard, ProgressBar with a finished state, AvatarStack, StatTile, CoverShelf, useLocalCover). Profiles get cover shelves, stat tiles and a reading streak. The buddy-reads list and Social home use cards with cover, your live progress, the other readers and pace, and handle a taken-down read. The buddy-read page has a cover hero and Overview / Discussion tabs; the discussion moved into the page, with a compact composer, a spoiler explainer, settings in a sheet (shared ToggleRow) and inline Reply. The old discussion URL redirects to the tab. A book picker starts a buddy read from Social.

Copy: "Buddy read" everywhere, "Send friend request", calmer pace wording, percentages instead of word counts, compact answered invites in the inbox, and onboarding and Cloud sync mention reading together.

Server and core: the streak rule moved to core (`streakFromDays`), shared by the stats page and profiles. `ProfileStats` gains current and longest streak, computed in the owner's time zone. `BuddyReadSummary` gains `members` and `originUnavailable`.

Verification: web 173, core 130, app 671 tests; typechecks clean. Three review passes (3 UX agents before implementation, then 2 and 4 code-review agents with each finding verified). Checked on an Android device in dark and light themes, signed out and in, and with the server unreachable.
<!-- SECTION:FINAL_SUMMARY:END -->
