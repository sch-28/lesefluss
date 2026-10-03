---
id: TASK-171.19
title: 'Landing page: "Read together" section advertising buddy reads'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-03 00:52'
updated_date: '2026-10-03 01:05'
labels:
  - social
  - website
dependencies: []
references:
  - 'https://claude.ai/artifact/FFMubKkUQDi6k2iXcW1ZnB'
modified_files:
  - packages/core/src/buddy-trailer.ts
  - packages/core/src/index.ts
  - packages/core/src/__tests__/buddy-trailer.test.ts
  - apps/capacitor/src/components/social/buddy-read-trailer.tsx
  - apps/capacitor/src/components/social/__tests__/buddy-read-trailer.test.tsx
  - apps/web/src/components/buddy-read-preview.tsx
  - apps/web/src/routes/index.tsx
  - apps/web/src/styles/app.css
parent_task_id: TASK-171
priority: medium
ordinal: 145000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The website landing page (apps/web/src/routes/index.tsx) never mentions social reading. Add a section that advertises buddy reads, as approved on the canvas boards "Landing · v2 casual heading" (desktop and mobile).

Placement: right after the "Read it your way" bento, before the Android app section. It follows the existing section pattern:
- the eyebrow "Buddy reads"
- the heading "Read together"
- a muted paragraph
- feature pills: Live progress, Spoiler-safe notes, Reactions, Invite-only
- a primary "Start a buddy read" link to /app/tabs/social and a "Get on Android" link

The visual is the same buddy-read trailer as the app's Social tab: three illustrated readers and "You" stepping along one shared track on their own rhythm. It shows the reaction bubble, the chapter burst and live-counting labels, and runs on a public-domain classic's cover bundled with the site (no network). It sits on a glow like the RSVP preview's, with a small floating chapter-note card.

The trailer's script (tick schedules, positions, captions, timings) moves into @lesefluss/core so the app and the website play the same animation. The website renders it without framer-motion, using CSS transitions only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The landing page shows the Read together section between the reader bento and the Android app section, at desktop and phone widths
- [x] #2 The section's trailer plays the same tick script as the app (shared from @lesefluss/core), starts when scrolled into view, rests on its last frame with a replay button, and shows only the final frame under prefers-reduced-motion
- [x] #3 The trailer is hidden from screen readers behind one descriptive sentence and is labelled Preview; illustrated readers have initials only
- [x] #4 The cover is a bundled public-domain classic; the section loads no extra network resources beyond existing site assets
- [x] #5 Start a buddy read links to /app/tabs/social; Get on Android links to /download
- [x] #6 The app's Social trailer still works unchanged after moving its script to core; core tests cover the positions for every self position on every tick
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. packages/core/src/buddy-trailer.ts: TRAILER_TICK_MS, TRAILER_LAST_TICK, TRAILER_MIN_GAP, TRAILER_READERS (names), TRAILER_NOTE_READER, TRAILER_BUBBLE_TICKS, TRAILER_BURST_TICK, trailerCaptionAt(), trailerPositions(). Export from index. Move the position tests to packages/core/src/__tests__/buddy-trailer.test.ts.
2. apps/capacitor buddy-read-trailer.tsx imports the script from core; keeps tone classes and rendering.
3. apps/web/src/components/buddy-read-preview.tsx: CSS-only renderer (translateX transitions, hop keyframe keyed per step, bubble and burst via transitions), IntersectionObserver + visibility to start, prefers-reduced-motion final frame, replay. SocialAvatar from @lesefluss/ui for initials.
4. apps/web/src/routes/index.tsx: section after the bento with copy, pills, CTAs, glow, tilted card with cover backdrop, floating note card, data-aos like neighbours.
5. Tests: core positions test; app tests still pass; web typecheck. Visual check in Chrome at desktop and phone width.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Checked in Chrome on the web dev server at desktop (1300px) and narrow (500px): section renders between the bento and the Android section, the trailer plays on the Pride and Prejudice cover, rests with replay. Note card moved below the card on desktop so it no longer covers the caption; backdrop blur lightened with a primary wash.

rcktbs review (2 fresh reviewers). Fixed: (1) narrow tracks on phones (~120-140px): BuddyTrack and the web preview are container-query sized, avatars min(30px, 18cqw-4px) and non-self labels hidden below 180px, checked in Chrome at a 121px track. (2) web reduced-motion users saw one 700ms sweep after hydration: motion-reduce:transition-none on all transitions. (3) DRY: usePrefersReducedMotion moved to @lesefluss/ui/use-prefers-reduced-motion (app hook file moved there); reader tones, burst dots and the tick hook (useBuddyTrailerTick) shared in @lesefluss/ui/buddy-trailer. (4) Core exports renamed BUDDY_TRAILER_* / buddyTrailer*. (5) TrackRider.hop renamed steps. (6) Landing: note card attributed to the script's note reader (Jo) via constants, spacing matches neighbours (py-20, gap-12, mb-8), duplicate Get on Android link dropped (Android section follows). (7) Core test asserts exact per-reader step counts. Note: the hook move was done with `git mv`, which staged a rename in the index.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Landing page now has a "Read together" section (eyebrow "Buddy reads") after the reader bento: copy, four feature pills, "Start a buddy read" (/app/tabs/social) and "Get on Android" (/download), and the buddy-read preview on a tilted card with a floating chapter-note card.

- The trailer script (tick schedules, positions, captions, timings) moved to `@lesefluss/core` (`buddy-trailer.ts`) with its tests; the app's Social trailer imports it, unchanged in behaviour.
- `apps/web/src/components/buddy-read-preview.tsx` renders the same script with CSS transitions only (translateX riders, `trailer-hop` keyframe per step, bubble and burst transitions). It starts when 40% in view, rests with replay, and shows the final frame under prefers-reduced-motion. aria-hidden with one sr-only sentence.
- The cover is the bundled Pride and Prejudice webp from /covers, so there are no new network requests.
<!-- SECTION:FINAL_SUMMARY:END -->
