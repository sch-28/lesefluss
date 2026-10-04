---
id: TASK-194
title: 'Social: create invite link automatically when opening the invite page'
status: Done
assignee: []
created_date: '2026-10-04 15:07'
updated_date: '2026-10-04 15:54'
labels:
  - social
  - capacitor
dependencies: []
modified_files:
  - apps/capacitor/src/pages/social/invite-link.tsx
  - apps/capacitor/src/pages/social/__tests__/invite-link.test.tsx
  - apps/capacitor/e2e-app/invite-friend.spec.ts
ordinal: 149000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
"Invite a reading buddy" navigates to /tabs/social/invite-link, which then asks for a second tap on "Create invite link". Auto-create once per visit when a fresh server fetch shows no link (create replaces any existing link, so a stale cached null must not trigger it; a link revoked on the page stays revoked).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Opening invite page without a link creates one with no extra tap
- [x] #2 Existing link is never replaced automatically
- [x] #3 Revoke on the page does not immediately recreate
- [x] #4 Typecheck, lint, tests pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Auto-create only on a successful fresh fetch (isFetchedAfterMount && !isFetching && !isError && data === null) while online, at most once per app session (module flag): a failed refetch keeps cached null and must not overwrite a real link; revoke stays revoked across revisits; tanstack-router double mount can't burn 2 of the 10/day creates. Account switch in the same session falls back to the manual button. e2e invite-friend no longer clicks "Create invite link". 3-agent review done; guards mutation-tested.

Device check: invite page showed the auto-created link on arrival; after Revoke, leaving and returning showed the Create invite link button instead of a new link.
<!-- SECTION:NOTES:END -->
