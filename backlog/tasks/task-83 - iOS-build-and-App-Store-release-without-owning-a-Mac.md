---
id: TASK-83
title: iOS build and App Store release without owning a Mac
status: In Progress
assignee: []
created_date: '2026-04-26 15:59'
updated_date: '2026-10-02 16:58'
labels:
  - ios
  - release
  - ci
milestone: m-13
dependencies: []
references:
  - .github/workflows/release.yml
  - scripts/gen-icons.sh
  - apps/capacitor/capacitor.config.json
  - 'https://capacitorjs.com/docs/ios'
  - 'https://docs.codemagic.io/yaml-quick-start/building-an-ionic-app/'
  - 'https://docs.fastlane.tools/actions/match/'
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ship Lesefluss to iPhone users through TestFlight and the App Store. Android already ships through `.github/workflows/release.yml` on `v*` tags. iOS should come from the same tag.

Constraint: the maintainer has no Mac, only Linux and an iPhone. Every step that needs macOS (xcodebuild, signing, upload) must run on a hosted macOS machine. Testing happens on a real iPhone through TestFlight because there is no simulator.

## Suggested path
1. **Apple Developer Program**: enroll as an individual ($99/year). Create the App ID `app.lesefluss` and the App Store Connect app record, then create an App Store Connect API key for CI.
2. **Add the iOS platform on Linux**: run `npx cap add ios` in `apps/capacitor`. Capacitor 8 uses Swift Package Manager by default, so CocoaPods and a Mac are not needed for this step. Commit `apps/capacitor/ios/`.
3. **Native configuration**: add Info.plist usage strings for the plugins in use: Bluetooth for `@capacitor-community/bluetooth-le`, camera and photo library for `@capacitor/camera`, and file access for the file picker. Extend `scripts/gen-icons.sh` so it also writes the iOS AppIcon and splash assets. Currently it writes only web, extension and Android assets.
4. **CI build**: add an iOS job that runs on a `v*` tag, using GitHub Actions `macos-latest` or Codemagic. Codemagic has a free tier of about 500 macOS minutes a month and good Capacitor support. On private GitHub repos, macOS minutes count 10x. The job should build the web assets as the Android job does, run `npx cap sync ios`, set the version from the tag, sign and upload to TestFlight. Use fastlane (`match` + `pilot`) or Codemagic's automatic signing, both with the App Store Connect API key. Store the secrets in the CI provider, never in the repo.
5. **Test on iPhone through TestFlight**: check the key flows. To debug the WebView without Safari on a Mac, use inspect.dev or `ios-webkit-debug-proxy` on Linux.
6. **Store listing**: make 6.9" screenshots (1320x2868), either from the iPhone or in Figma. Fill in the privacy nutrition labels to match the existing privacy policy. Submit for review.
7. **Fallback**: if a native issue can't be solved from CI logs, rent a remote Mac for a few hours (MacinCloud about $1/hour, or Scaleway Apple silicon with a 24h minimum). Don't use a macOS VM on non-Apple hardware because it breaks Apple's EULA.

Out of scope: the share extension (TASK-39) and the iOS PWA (TASK-121).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `apps/capacitor/ios/` is committed and `npx cap sync ios` succeeds in CI
- [ ] #2 Pushing a `v*` tag produces a signed iOS build uploaded to TestFlight without any manual Mac step
- [ ] #3 iOS build version and build number are derived from the tag, matching the Android scheme
- [ ] #4 All signing material and API keys are stored as CI secrets, none in the repo
- [ ] #5 App installs from TestFlight on a physical iPhone. Reading, import, sync login and BLE device pairing all work
- [ ] #6 iOS app icon and splash are generated from `resources/logo.svg` by the same icon script
- [ ] #7 Info.plist has usage descriptions for every permission the app requests, so the app has no permission-related crashes or review rejections
- [ ] #8 App Store listing is complete (screenshots, description, privacy labels) and the first version passes App Store review
- [ ] #9 Release steps for iOS are documented next to the existing Android release docs
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Research findings (2026-10-02)

### Repo state
- No `apps/capacitor/ios/` yet. `.gitignore` already has iOS build-artifact patterns.
- Capacitor CLI 8.5.0 ships both `ios-spm-template` and `ios-pods-template`. `cap add ios` and `cap sync ios` run on Linux (pod install / xcodebuild clean are skipped with a warning when the tools are missing).
- **Blocker for SPM:** `@capacitor-community/sqlite@8.0.1` has no `Package.swift` (podspec only: deps SQLCipher + ZIPFoundation). Under the SPM template the CLI only warns "Some installed Capacitor plugins are not compatible with SPM" and drops it, so the DB would be missing on iOS. Decision: `npx cap add ios --packagemanager CocoaPods`; CI runs `pod install`. All other plugins (bluetooth-le, file-picker, camera, filesystem, ...) have both. Alternative later: `@capawesome-team/capacitor-sqlite` (SPM, sponsorware).
- Custom Android-only native code in `android/app/src/main/java/app/lesefluss/` with no iOS counterpart. JS registers them via `registerPlugin` and calls them whenever `Capacitor.isNativePlatform()`, so on iOS the calls reject with "not implemented":
  - `NativeHttpPlugin` (OkHttp Chrome-fingerprint scraping, WebView fallback, Cloudflare challenge) used by `services/serial-scrapers/fetch.ts` and `components/cloudflare-challenge.tsx`. v1: on iOS take the web path (catalog `/proxy/article`). Swift port (URLSession + WKWebView) is a follow-up.
  - `ShareIntentPlugin` (share sheet + "Open with"). v1: `CFBundleDocumentTypes` for epub/pdf/html/md so Files "Open with" delivers a `file://` URL through `appUrlOpen`; share-sheet text/URL needs a Share Extension (TASK-39).
  - `BookScannerPlugin` (SAF folder walk). v1: hide folder import on iOS, multi-file picker instead.
  - `ImageProxyWebViewClient` (strips CORP headers on cross-origin images). v1: skip; check explore covers on device; WKURLSchemeHandler port if needed.
  - `update-check` is already Android-only; add App Store URL later.
- Deep links: `lesefluss://auth-callback` (sync-context) needs `CFBundleURLTypes`; `https://lesefluss.app/invite/*` needs an Associated Domains entitlement `applinks:lesefluss.app` plus `/.well-known/apple-app-site-association` served by `apps/web` (JSON, no redirect, no extension) next to the existing `assetlinks.json` route. Needs the Team ID, so after enrollment.
- Info.plist keys needed: `NSBluetoothAlwaysUsageDescription` (bluetooth-le crashes without it), `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription` (camera plugin), `ITSAppUsesNonExemptEncryption=false` (skips export compliance prompt per build), document types for import.
- Icons/splash: extend `scripts/gen-icons.sh` to write `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` (1024x1024, opaque) and `Splash.imageset` (2732x2732 x1/x2/x3, light + dark variants to match the Android splash).
- Version: `MARKETING_VERSION` from the tag, `CURRENT_PROJECT_VERSION` = the same `MAJOR*10000+MINOR*100+PATCH` code as `release.yml` (set via `agvtool` or `xcodebuild` build settings).
- Debugging without a Mac: `ios-webkit-debug-proxy` on Linux (usbmuxd + libimobiledevice; iOS 17+ needs recent libimobiledevice with tunnel support, flaky). Fallbacks: the existing telemetry endpoint and TestFlight crash logs.

### Apple
- Developer Program: $99/year, individual. Enroll in the Apple Developer app on the iPhone (same device for the whole flow), Apple ID with 2FA, legal name, government ID, possibly video selfie. Verification typically 1-2 days, can be longer.
- After enrollment: Identifiers → App ID `app.lesefluss` (explicit, Associated Domains capability), App Store Connect → New App (iOS, bundle `app.lesefluss`, SKU, primary language), Users and Access → Integrations → Team Keys → generate key with App Manager role, note Issuer ID + Key ID, download `.p8` (one download only).
- TestFlight: internal testers (up to 100 App Store Connect users) get builds minutes after processing, no Beta App Review. External testers need Beta App Review (days). Use internal for ourselves.
- Apple requires iOS 26 SDK (Xcode 26) for submissions; Capacitor 8 requires Xcode 26 too.

### CI
- Codemagic personal account: 500 free M2 minutes/month (reset on the 1st, personal accounts only, 1 concurrency). A Capacitor iOS build is roughly 10-15 min, so ~35 builds/month. Automatic signing: upload the App Store Connect key under the account's code signing identities, then `ios_signing: {distribution_type: app_store, bundle_identifier: app.lesefluss}` + `xcode-project use-profiles` creates the distribution certificate and profile on the fly (no Mac, no CSR). `publishing.app_store_connect.submit_to_testflight: true`.
- Alternative: GitHub Actions `macos-26` is free and unlimited for this public repo; signing can reuse codemagic-cli-tools (`pip install codemagic-cli-tools`) with the same API key. Keeps everything in `release.yml`. Start with Codemagic (less to wire), migrate later if minutes run out.

## Steps
1. Apple Developer Program enrollment (user, iPhone). Start first, it gates everything.
2. Repo: `npx cap add ios --packagemanager CocoaPods`, Info.plist keys, URL scheme, document types, icon/splash generation, iOS gating for the four Android-only plugins. Commit `apps/capacitor/ios/`.
3. Apple portal: App ID, App Store Connect app record, Team API key.
4. Codemagic: personal account via GitHub, add repo, upload API key, `codemagic.yaml` at repo root (pnpm + corepack, `pnpm build` with VITE_* env, `cap sync ios`, `pod install`, `use-profiles`, version from tag, `build-ipa`, TestFlight publish on `v*` tags; manual trigger for the first run).
5. First TestFlight build, install on iPhone as internal tester, test reading/import/sync/BLE. Iterate on native issues from CI logs.
6. Universal Links (AASA + entitlement) once the Team ID exists.
7. Store listing, privacy labels, screenshots, review.
8. Docs next to Android release docs.
<!-- SECTION:PLAN:END -->
