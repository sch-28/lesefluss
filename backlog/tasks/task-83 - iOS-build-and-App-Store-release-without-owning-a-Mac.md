---
id: TASK-83
title: iOS build and App Store release without owning a Mac
status: To Do
assignee: []
created_date: '2026-04-26 15:59'
updated_date: '2026-09-25 23:46'
labels:
  - ios
  - release
  - ci
milestone: m-8
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
