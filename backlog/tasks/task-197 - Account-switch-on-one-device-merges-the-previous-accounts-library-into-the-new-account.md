---
id: TASK-197
title: >-
  Account switch on one device merges the previous account's library into the
  new account
status: To Do
assignee: []
created_date: '2026-10-04 18:30'
labels:
  - sync
  - privacy
  - bug
dependencies: []
references:
  - apps/capacitor/src/services/sync/session.ts
  - apps/capacitor/src/services/sync/index.ts
  - apps/capacitor/src/contexts/sync-context.tsx
  - apps/web/src/lib/sync-book-upsert.ts
priority: high
ordinal: 153000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Problem

When account A signs out and account B signs in on the same device, B ends up with A's whole local library. A's books, highlights, glossary entries and reading sessions are also uploaded into B's server account, and from there they sync to all of B's devices. This leaks one person's library into another person's account, and the copy is permanent.

This affects both builds:
- **Web build (`/app`)**: local data lives in jeep-sqlite (IndexedDB) and survives the website sign-out. The web build has no in-app sign-out because the site header calls better-auth directly. The only place an account switch is noticed is `adoptSyncIdentity` in `apps/capacitor/src/services/sync/session.ts`.
- **Native**: `signOut` → `clearToken` drops the token and the per-account caches but keeps every local row. `clearToken` also removes the stored email, so after a sign-out, signing in as B looks the same as a first-ever sign-in.

How the leak happens: `adoptSyncIdentity` / `clearAccountScopedState` only clear caches about what the server already holds (server content ids, quota block, session push watermark, last synced, social queries). The next `fullSync` → `pushSync` sends everything from `getBooksForSync`, highlights, glossary and all reading sessions (the watermark was reset). Because the server-content cache was cleared, full book content is uploaded too. The server keys `sync_books` by `(userId, bookId)` (`apps/web/src/lib/sync-book-upsert.ts`), so B's account gets its own copy. Settings do not leak, because they are not pushed until B's settings have been pulled.

## Constraints (why "just wipe" is not acceptable)

- A user with no account imports books and then signs in for the first time. Their local library must still be uploaded into that account. This is the normal onboarding path and must keep working.
- The previous person may never have had sync on, or may have local-only data: unsynced edits, offline changes, or books too large to sync (`isSyncEligible`). Silently deleting it on an account switch destroys data that exists nowhere else.
- Telling "first sign-in on this device" apart from "a different account than last time" needs a record of which account the local data belongs to. That record must survive sign-out, and today nothing like it exists.

## Open design question (decide before implementing)

The approach is not settled. Options so far:
- Ask the user on a detected account switch: add the existing local library to this account, or keep it out. Needs a separate answer for local data that has no owner (it was created while signed out after A signed out).
- Scope local rows to an owner account so each account sees only its own library on a shared device, and data created while signed out stays unowned until it is claimed.
- Wipe on switch, rejected so far by the user because of the constraints above.

Settle the approach with the user before writing code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 On the web build, signing in as account B after account A was signed in on the same browser does not upload any of A's books, highlights, glossary entries or reading sessions into B's server account without the user choosing that
- [ ] #2 On native, sign out of A and then sign in as B on the same device: no data from A is uploaded into B's account without the user choosing that
- [ ] #3 A user who imported books with no account and then signs in for the first time still gets that local library uploaded to their account
- [ ] #4 A previous user's local-only data (never synced, or too large to sync) is not deleted silently on an account switch
- [ ] #5 Signing out of and back into the same account on one device keeps the library unchanged and does not create duplicates
- [ ] #6 Automated tests cover: first sign-in with an existing local library, switching from A to B, signing back into the same account, and web identity change detection
- [ ] #7 agents/capacitor.md documents how account switches are handled
<!-- AC:END -->
