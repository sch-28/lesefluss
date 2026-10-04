---
id: TASK-196
title: >-
  Native sign-in screen redesign: browser and phone as primary paths,
  email/password as fallback
status: Done
assignee: []
created_date: '2026-10-04 15:48'
updated_date: '2026-10-04 15:57'
labels:
  - ui
  - sync
  - capacitor
dependencies: []
references:
  - apps/capacitor/src/components/sync/sign-in-options.tsx
  - apps/capacitor/src/pages/onboarding/steps/sync.tsx
  - apps/capacitor/src/routes/tabs/settings/sync.tsx
  - >-
    backlog/tasks/task-191.2 -
    In-app-email-password-sign-in-for-native-builds.md
modified_files:
  - apps/capacitor/src/components/sync/sign-in-options.tsx
  - apps/capacitor/src/components/sync/__tests__/sign-in-options.test.tsx
  - apps/capacitor/src/routes/tabs/settings/sync.tsx
  - apps/capacitor/src/pages/onboarding/steps/sync.tsx
  - apps/capacitor/e2e/sign-in-password.spec.ts
  - apps/capacitor/e2e/sign-in-phone.spec.ts
  - apps/capacitor/e2e/eink-mode.spec.ts
priority: medium
ordinal: 151000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The native sign-in UI (PasswordSignInForm, mounted in Settings > Sync signed-out and the onboarding sign-in step) leads with the email/password form and lists "Sign in with your phone" and "Sign in in your browser" as same-looking outline buttons. No visual hierarchy, no clear direction, and the in-app credentials form is meant to be the fallback for when neither the browser nor a phone is available (e.g. e-readers).

Redesign the component so the browser and phone paths are the obvious choices, each with an icon and a one-line explanation, and the email/password form sits behind a quiet "use email and password" disclosure. E-ink mode keeps phone first (typing is slow, browser often broken). Web build unaffected.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Browser and phone sign-in are visually distinct primary choices with icon + one-line description; one is clearly the recommended default
- [x] #2 Email/password form is collapsed behind a secondary disclosure and only shown on demand
- [x] #3 E-ink mode puts phone first and stays static/high-contrast (no motion, no low-contrast)
- [x] #4 Settings > Sync and onboarding both use the new layout; web build unchanged
- [x] #5 Existing unit + e2e sign-in tests updated and green
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review pass (3 fresh-context reviewers: conventions, correctness/a11y, UX/copy/e-ink). Fixed: renamed PasswordSignInForm -> SignInOptions (sign-in-options.tsx) since password is now the minor path; browser error renders under the browser option in either mode (was always under the secondary card); primary option description linked via aria-describedby; aria-controls only set while the form exists; toggle clears the form error and is disabled while a password sign-in is pending; toggle touch target raised from h-7 to min-h-11; dropped the extra border-t that doubled the Settings section rule; tests assert aria-expanded and which option is filled (data-variant), not just DOM order. Skipped: Accordion primitive (hand-rolled disclosure is simpler, matches rsvp-pickers ModeCards precedent); separate props type alias (nit); outline submit inside fallback (kept deliberately quiet); pre-existing "Opening browser..." label swap while focused; pre-existing em-dashes in onboarding copy and footer "Not now" competing as primary. After fixes: biome, tsc clean, vitest 1046 green, e2e sign-in/eink/onboarding 15 green.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Native sign-in reworked into a clear hierarchy. Primary: filled "Continue in your browser" button (globe icon, arrow, caption covering Google/Discord/sign-up). Secondary: outlined card "Sign in with your phone" with icon and one-line description. E-ink swaps them (phone primary). Email + password moved behind a "No browser or phone at hand? Sign in with email and password" disclosure (aria-expanded/controls). Browser-open errors now render outside the collapsed form so they stay visible. Settings > Sync native intro copy no longer says "on the website". Unit tests cover collapsed default and mode-dependent order; e2e specs open the disclosure before filling, eink order check compares phone vs browser position. biome, tsc, vitest (sync), e2e sign-in/eink/onboarding: green.
<!-- SECTION:FINAL_SUMMARY:END -->
