---
id: TASK-171.18
title: >-
  Social tab redesign: first-run hero with buddy-read trailer, profile hero,
  distinct sections
status: Done
assignee:
  - '@claude'
created_date: '2026-10-02 21:34'
updated_date: '2026-10-02 23:48'
labels:
  - social
  - ui
dependencies:
  - TASK-171.17
references:
  - 'https://claude.ai/artifact/FFMubKkUQDi6k2iXcW1ZnB'
modified_files:
  - apps/capacitor/src/components/social/buddy-track.tsx
  - apps/capacitor/src/components/social/buddy-read-trailer.tsx
  - apps/capacitor/src/components/social/cover-backdrop.tsx
  - apps/capacitor/src/components/social/paste-invite-field.tsx
  - apps/capacitor/src/components/social/buddy-read-card.tsx
  - apps/capacitor/src/components/social/activity-feed.tsx
  - apps/capacitor/src/components/social/social-ui.tsx
  - apps/capacitor/src/components/social/__tests__/buddy-read-trailer.test.tsx
  - apps/capacitor/src/pages/social/index.tsx
  - apps/capacitor/src/pages/social/first-run-hero.tsx
  - apps/capacitor/src/pages/social/me-hero.tsx
  - apps/capacitor/src/pages/social/friends-row.tsx
  - apps/capacitor/src/pages/social/signed-out.tsx
  - apps/capacitor/src/pages/social/invite-link.tsx
  - apps/capacitor/src/pages/social/__tests__/social-page.test.tsx
  - apps/capacitor/src/hooks/use-is-foreground.ts
  - apps/capacitor/src/hooks/use-prefers-reduced-motion.ts
  - apps/capacitor/src/pages/explore/hero.tsx
  - apps/capacitor/src/pages/reader/buddy-read-markers.tsx
  - apps/capacitor/src/pages/reader/index.tsx
  - packages/ui/src/components/social-avatar.tsx
parent_task_id: TASK-171
priority: high
ordinal: 138000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A first-time user who opens the Social tab sees three empty sections, each with its own call to action, and cards that all look the same. Even the profile card is a plain row. Nothing there makes them want to try social features. This task redesigns the tab so it sells buddy reading to new users and looks richer for users who already have friends.

The approved mockup (link in references) has four boards: first run, with friends, signed out, and the trailer component. Treat it as the visual spec. Use the real tokens for light, dark and sepia.

**Buddy-read trailer (one shared component).** It shows a short, finite animation of a buddy read on one shared progress track.
- The book is the user's real current book: its real cover and their real percent. With no book in progress, it falls back to a bundled demo cover.
- Three illustrated readers ride the track beside "You". They have initials only, no handles and no online dots, and the card is labelled "Preview".
- A reaction bubble pops over one reader, and later a chapter-finish burst plays.
- It plays for about 8 seconds, then rests on the final frame and offers a replay.
- The same track design is reused by the real buddy-read cards with real members.

**State without friends** (no friends and no incoming requests). One hero card replaces the separate empty sections. It holds:
- a backdrop from the real cover of the user's current book
- the trailer
- a headline
- one "Invite a reading buddy" action
- a field to paste an invite link
- a "waiting on X" line for sent requests

Below the hero is a short "How it works" list. Buddy reads, Friends and Activity stay hidden until there is a friend.

**State with friends.**
- **Profile hero:** a cover backdrop, a large avatar with a ring showing current-book progress, three stats (friends, active buddy reads, day streak) and a "Now reading" strip.
- **Friend requests:** a distinct card.
- **Buddy reads:** the first is a large card led by its cover, with the shared track. The rest are compact.
- **Friends:** a horizontal row of large avatars, each with a ring and a caption for their current book (data from TASK-171.17), ending in an Invite item.
- **Activity:** a timeline.
- **Inbox:** moves from a list row to a header icon with an unread badge.

**Signed out.** The same trailer in a full-height hero above the sign-in action. The privacy note is worded as a benefit ("no public search"), not a limitation.

**Constraints.**
- Real data never reveals when someone reads: the activity feed stays day-granular, with no clock times and no "reading now" claims about real people.
- Animations use transform and opacity only.
- Covers are blurred once and statically; nothing animates a blur.
- Looping motion pauses off screen and while the app is in the background.
- Reduced motion shows the final frame.
- Hardcoded colours in the social UI (the emerald finished state, black cover scrims) are replaced with theme tokens so sepia and dark render correctly.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A signed-in user with no friends and no incoming requests sees one hero (trailer, invite action, paste-link field) and no empty Buddy reads, Friends or Activity sections
- [x] #2 The trailer uses the user's current book cover and real percent when a book is in progress, and a bundled demo cover otherwise; it needs no network
- [x] #3 Illustrated trailer readers are marked as a preview, have no handles, and are hidden from screen readers behind one descriptive sentence
- [x] #4 The trailer plays once (about 8s), rests on the final frame, offers replay, pauses when off screen or the app is backgrounded, and shows only the final frame under reduced motion
- [x] #5 Sent requests show inside the first-run hero; an incoming request shows above it as its own card with Accept and Decline
- [x] #6 With friends, the page shows the profile hero (cover backdrop, progress ring avatar, friends / active buddy reads / streak stats, now-reading strip) in place of the old profile row
- [x] #7 Buddy read cards use the shared-track design with real member positions; the first active read is the large cover-led card
- [x] #8 Friends render as a horizontal avatar row with current-book progress rings and captions when TASK-171.17 data is present, and plain avatars when it is absent
- [x] #9 Activity renders as a timeline and still shows only day labels, never clock times
- [x] #10 Inbox is reached from a header icon with an unread badge; the old list row is gone
- [x] #11 The signed-out screen shows the trailer and the sign-in action; builds without sync show the trailer without a sign-in action
- [x] #12 Light, dark and sepia all render without hardcoded colours in the social components (no emerald finished state, no black scrims)
- [x] #13 Images used in the new UI are not draggable (WebView long-press freeze)
- [x] #14 Component tests cover the without-friends and with-friends variants and the trailer's reduced-motion final frame; existing social tests pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
New building blocks (apps/capacitor/src):
- hooks/use-prefers-reduced-motion.ts: moved out of pages/explore/hero.tsx; hooks/use-is-foreground.ts: moved out of pages/reader/buddy-read-markers.tsx (both re-imported at the old call sites).
- components/social/buddy-track.tsx: shared track. Each rider is a full-track-width layer moved with translateX(percent%), so motion is transform-only. Self rider gets a primary ring and a label; overlays per rider via render prop.
- components/social/buddy-read-trailer.tsx: 7-step script (1.3s per step), illustrated riders, reaction bubble, chapter burst, replay. Plays once, pauses off screen (useInView) and in background (useIsForeground), reduced motion renders the final step. Uses the current book (cover + percent) or a CSS demo cover; aria-hidden with an sr-only sentence.
- components/social/cover-backdrop.tsx: static blurred cover + primary color-mix wash + card scrim; no animation.
- components/social/use-current-book.ts: first of useStatsCurrentlyReading + useLocalCover.

Screens:
- pages/social/first-run-hero.tsx: hero (backdrop, trailer, headline, invite CTA, paste-link field via parsePastedInvite, waiting-on lines for outgoing requests with Cancel) + How it works.
- pages/social/me-hero.tsx: avatar with conic ring for current book, stats (friends, active buddy reads, streak via useStatsStreak), now-reading strip.
- pages/social/friends-row.tsx: horizontal avatars, rings and captions from nowReading, Invite item. Friend actions stay on the profile page (already has remove/report/block).
- components/social/buddy-read-card.tsx: `featured` variant (cover-led with backdrop) and compact variant, both on BuddyTrack.
- components/social/activity-feed.tsx: timeline rail; still day labels only.
- pages/social/index.tsx: incoming request cards on top; no friends -> FirstRunHero; friends -> MeHero, buddy reads, friends row, sent requests, activity. Inbox moves to header icon with badge; list row removed.
- pages/social/signed-out.tsx: trailer in full-height hero.
- social-ui.tsx: finished state and cover scrims on tokens. packages/ui SocialAvatar img draggable=false.

Tests: component tests for first-run vs with-friends page variants and trailer reduced motion final frame. Update e2e invite-friend spec if the friend row no longer shows the @handle text. Verify visually in Chrome (light/dark/sepia).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified in Chrome against a throwaway e2e-style database (web dev server on :3417, seeded ada/bea/cy/dee, friendships, books, a buddy read, feed events): signed out, first run, with friends, in dark, light and sepia. Trailer playback was checked by forcing document visibility (the automation tab reports hidden, which correctly pauses it). Database dropped and server stopped afterwards; apps/web/public/app (gitignored) now holds a fresh WEB_BUILD bundle.

Not seen visually: the Now reading strip and real cover backdrops, because the browser's local library was empty in the preview. The code paths are the same useCurrentBook/useLocalCover as the stats page.

Friends without nowReading show their @handle as the caption, which keeps e2e-app/invite-friend.spec.ts's `getByText('@ada_e2e')` valid. The app e2e suite was not run.

Friend actions (remove, report, block) moved off the Social list; they remain on the friend's profile page.

rcktbs review (3 fresh reviewers + verifier). Security: no findings. Fixed: (1) users with buddy reads but no friends lost the Social entry to their buddy reads and own feed events; the first-run branch now also shows BuddyReadsPreview when any read exists and ActivityFeed with isHiddenWhenEmpty. (2) BuddyTrack padding px-4 to px-6 so a rider at 0%/100% keeps its outline and label. (3) Trailer readers overlapped at phone width (track ~150px): readerEnds rewritten to pick the nearest free spots with MIN_GAP 22% and TRAVEL 6%, tested for every self position 0..100 at start and end. (4) MeHero uses ProgressBar instead of a copy. (5) Named MIN_GAP / NOTE_READER constants, dropped dead `?? 0`s, member count from riders.length, CurrentBook no longer exported. Refuted: moving TrailerCard out of first-run-hero.tsx.

Follow-up from user testing: (1) Social loading spinner centred (social-gate Spinner min-h-[60vh] items-center). (2) Trailer motion was barely visible: the track now spans the card width under the cover row (~210px on a 360px phone instead of ~150px), everyone including You moves 28% (MIN_GAP 17%) via trailerPositions(), caption and replay moved beside the cover. Tested for every self position and step; checked in Chrome.

User preferred the original trailer layout (track beside the cover); restored it with a 60px cover so the track keeps ~170px. Motion reworked for liveliness: 16 ticks of 550ms; each rider (You included) steps 2% eight times on its own schedule (SCHEDULES), never more than one step ahead of another, with a hop on each step and live-counting labels. Spacing MIN_GAP 18 + STEP; tested for every self position on every tick.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The Social tab now sells buddy reading to new users and looks richer for existing ones.

- New shared `BuddyTrack`: everyone on one line, moved by translateX only. Used by the trailer and by real buddy-read cards (the first card is cover-led over a blurred backdrop).
- `BuddyReadTrailer`: a 7-step (~8s) illustrated buddy read on the reader's own current book (or a CSS demo cover), with a reaction bubble, a chapter burst and replay. It plays once, pauses off screen or in the background, and shows only the final frame under reduced motion. It is marked Preview and is hidden from screen readers behind one sentence.
- No friends: one `FirstRunHero` (backdrop, trailer, invite CTA, paste-link field, waiting-on lines) plus How it works. Incoming requests are their own cards above it.
- With friends: `MeHero` (progress-ring avatar, friends / buddy reads / streak, now reading), featured buddy read, `FriendsRow` with rings from TASK-171.17, sent requests, and an activity timeline (day labels only).
- Inbox moved to a header icon with an unread badge. The signed-out screen uses the trailer card.
- Tokens: the emerald finished state and black scrims replaced; avatar and backdrop images are not draggable.
- Hooks `useIsForeground` and `usePrefersReducedMotion` moved to `src/hooks`. The paste-invite field is shared with the invite-link page.
- Tests: page variants (first run, incoming above hero, with friends) and the trailer (reduced motion final frame, demo book, own book, readers clear of You, screen-reader sentence). All 983 app tests pass.
<!-- SECTION:FINAL_SUMMARY:END -->
