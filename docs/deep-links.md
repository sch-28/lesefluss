# Deep links

How `https://lesefluss.app/...` links open inside the Android app, and how to add a new one.

## Claimed paths

| Path | Opens | Since |
|------|-------|-------|
| `/invite/<token>` | `/tabs/social/invite/<token>` (invite confirmation) | 1.6 |

Nothing else is claimed. `/`, `/app/...` and every other website path keep opening in the
browser, including the web build under `/app`.

A link never grants access to anything by itself (ADR-0004): at most it takes a signed-in user
to something that already belongs to them, or to a confirmation screen where they act.

## Moving parts

- **Parser**: `apps/capacitor/src/services/deep-links/parse.ts`. Pure function from URL to
  in-app destination. Rejects other origins and schemes, validates the token shape, and returns
  `unknown-claimed` for a claimed prefix this build does not understand (opened in the in-app
  browser so the user is not bounced back into the app).
- **Listener**: `use-deep-links.ts`, mounted once in `routes/__root.tsx`, native only. Handles
  warm starts (`appUrlOpen`) and cold starts (`App.getLaunchUrl()`), deduped by URL. It ignores
  `lesefluss://` URLs; the auth callback listener in `sync-context.tsx` owns those.
- **Pending link**: `pending-link.ts`. When onboarding is not finished or the user is signed out,
  the destination is stored in Preferences (latest only, 24 h) and replayed after onboarding,
  after sign-in (Social tab mount) or after the handle claim. Cleared on sign-out and account
  switch through `clearAccountScopedState()`.
- **History**: a cold start has no history, so the listener navigates to `/tabs/social` first and
  then pushes the destination, so back does not exit the app.
- **Android**: the `autoVerify` intent filter in `AndroidManifest.xml` lists one `pathPrefix` per
  claimed path. `ShareIntentPlugin` only treats `file`/`content` URIs as imports, so an App Link
  is never mistaken for an "Open with" file.
- **Website**: `apps/web/src/routes/[.]well-known/assetlinks[.]json.ts` (the bracket escape keeps the router generator from skipping the dot-directory) serves the Digital Asset
  Links statement. Every claimed path also has a website page (`/invite/<token>` is
  `routes/invite/$token.tsx`), because older app builds and other platforms open the link in
  the browser.

## Adding a claimed path

1. Ship the website page for the path first, in a release before the app claims it.
2. Add the destination to `parseDeepLink` and a test in `__tests__/parse.test.ts`.
3. Extend `PendingLink` if the destination must survive onboarding or sign-in.
4. Add a `<data android:pathPrefix="..."/>` line to the `autoVerify` intent filter. Never claim
   `/` or `/app/`.
5. Update the table above.

## Device link sign-in (`/link`)

Not an App Link; a website page that signs in *another* device. For e-readers whose browser
cannot render the site (Boox NeoBrowser), and for any device without a usable browser.

Flow, using better-auth's `deviceAuthorization` plugin (RFC 8628) configured in
`apps/web/src/lib/auth.ts`:

1. The app (`services/sync/device-sign-in.ts`) posts to `/api/auth/device/code` as client
   `lesefluss-app` and gets a `device_code` (40 random characters, kept in memory, never shown)
   and a `user_code` (8 characters from an alphabet without 0/O/1/I, shown as `ABCD-2345` and
   as a QR of `https://lesefluss.app/link?user_code=ABCD2345`).
2. The user opens that link on a phone or types the code at `/link` on any browser. Signed out,
   the page sends them through `/login?redirect=/link?user_code=…`. Signed in, it names the
   account and offers Approve or Deny (`routes/link/index.tsx` → `lib/device-link.ts` →
   `auth.api.deviceApprove` / `deviceDeny`, which require a session).
3. The app polls `/api/auth/device/token` every 3 s (`components/sync/use-device-sign-in.ts`),
   pausing in the background or offline. On approval the server mints a session, deletes the
   code row and returns the session token; the app finishes through the same
   `completeLogin` as the deep-link sign-in.

Security properties:

- A code lives 10 minutes and is deleted on redemption, denial or expiry: it works at most once.
- Only the app instance that requested the code holds the `device_code`, so approving a code
  can never sign in anyone else's device, even if the `user_code` was guessed or shoulder-read.
- Approve and deny need a signed-in session; the page shows which account is about to be used.
- Direct hits on `/device/code`, `/device/token`, `/device/approve`, `/device/deny` and `/device`
  are rate-limited per IP (`rateLimit.customRules`), and polling faster than the interval is
  refused (`slow_down`). The website page calls `auth.api` server-side, which bypasses that
  limiter, so `lib/device-link.ts` limits decisions per IP itself.
- Device-code phishing (a stranger requests a code and sends the victim the link) is the
  flow's inherent risk: the page names the account, warns against codes received from others,
  and only enables Approve after the user confirms the device is in front of them.

`/link/` could later be claimed as an App Link so a phone with Lesefluss installed confirms
inside the app with its bearer session (parser destination, `PendingLink` variant, manifest
`pathPrefix`, and an in-app confirm screen calling `/api/auth/device/approve` through
`authedFetch`). Not done yet; the website handles every phone today.

## Signing key fingerprints

`assetlinks.json` must list the SHA-256 of every certificate the app is signed with:

- **Local release keystore** (sideloaded APKs from `pnpm build:apk`): the file at `KEYSTORE_PATH`
  in `apps/capacitor/.env.deploy`. Read it with
  `keytool -list -v -keystore release.keystore -storepass "$KEYSTORE_PASSWORD"` and copy the
  `SHA256:` line. It is hard-coded in the route.
- **Play App Signing key** (Play installs): Play Console → Test and release → Setup → App
  signing → "App signing key certificate" → SHA-256. Set it as the `PLAY_APP_SIGNING_SHA256`
  environment variable on the web server (Coolify); the route appends it when present.

Verify on a device after installing a release build and waiting for the verifier
(or `adb shell pm verify-app-links --re-verify app.lesefluss`):

```sh
adb shell pm get-app-links app.lesefluss        # lesefluss.app: verified
adb shell am start -W -a android.intent.action.VIEW -d "https://lesefluss.app/invite/test"
curl -sI https://lesefluss.app/.well-known/assetlinks.json | grep -i content-type   # application/json, no redirect
```
