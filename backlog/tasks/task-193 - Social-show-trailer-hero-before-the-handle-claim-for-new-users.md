---
id: TASK-193
title: 'Social: show trailer hero before the handle claim for new users'
status: Done
assignee: []
created_date: '2026-10-04 14:57'
updated_date: '2026-10-04 15:04'
labels:
  - social
  - capacitor
dependencies: []
modified_files:
  - apps/capacitor/src/pages/social/handle-claim-hero.tsx
  - apps/capacitor/src/pages/social/first-run-hero.tsx
  - apps/capacitor/src/pages/social/social-gate.tsx
  - apps/capacitor/src/components/social/handle-claim-step.tsx
  - apps/capacitor/src/pages/social/__tests__/social-page.test.tsx
  - apps/capacitor/e2e-app/sign-in-return.spec.ts
ordinal: 148000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
SocialGate's no-handle branch shows a plain "Pick a handle" card, so new signed-in users never see the trailer first-run hero. Wrap the handle claim in TrailerCard: headline + "Pick your handle" CTA that swaps to HandleClaimStep, plus the How it works steps.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Signed-in user without handle sees TrailerCard with headline and Pick your handle CTA
- [x] #2 CTA swaps card body to HandleClaimStep with a way back
- [x] #3 How it works steps shown below, shared with FirstRunHero
- [x] #4 Typecheck, lint and social tests pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
SocialGate no-handle branch renders HandleClaimHero (own file): TrailerCard + "Pick your handle" CTA -> HandleClaimStep (Back, focusOnMount on handle input), plus shared HowItWorks exported from first-run-hero. Applies to all gated routes incl. deep links (accepted). Back discards typed input (accepted). invite.tsx keeps its own handle step. e2e sign-in-return asserts the CTA button now. Visually verified in Chrome on throwaway e2e DB (user fay). 3-agent review done; findings fixed.
<!-- SECTION:NOTES:END -->
