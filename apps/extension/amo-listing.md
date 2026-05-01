Lesefluss is a distraction-light reading system. The extension lets you save articles you find on the web straight into your library so you can read them later on the website, the mobile app, or your ESP32 handheld reader.

## Features

- **Save the current page**: click the toolbar icon to extract the article text and save it to your library.
- **Save selected text**: highlight any passage on a page, right-click, and choose "Save selection to Lesefluss".
- **Reader-friendly extraction**: uses Mozilla Readability so you keep the article body and skip nav, ads, and sidebars.
- **Sync everywhere**: saved articles appear on lesefluss.app, the Lesefluss mobile app, and the ESP32 reader the next time they sync.

## Requirements

A free Lesefluss account at https://lesefluss.app. Sign in from the popup; the extension stores a session token in `chrome.storage.local` so you stay signed in between sessions.

## Privacy

Page content is sent to the Lesefluss server only when you explicitly click "Save". The extension does not track browsing, read pages in the background, or send any data without your action. Your authentication token is stored locally and only sent to the Lesefluss API.

Source code: https://github.com/sch-28/lesefluss (AGPL-3.0).

---

# Privacy Policy

The Lesefluss browser extension processes data only when you explicitly invoke it.

**What is sent to Lesefluss servers**

- When you click "Save this page" or "Save selection", the extension sends the article HTML, the page URL, and the page title to https://lesefluss.app over HTTPS, authenticated with your account.
- During sign-in, the extension exchanges a one-time state nonce with lesefluss.app to obtain a session token.

**What is stored locally**

- Your session token and email address are stored in browser storage (`chrome.storage.local` / `browser.storage.local`) so you remain signed in between popup opens. Both are removed when you sign out.

**What is not collected**

- The extension does not track browsing activity.
- The extension does not read pages in the background.
- The extension does not send analytics or telemetry.
- No third-party services receive any data from the extension.

**Account data**

Articles you save become part of your Lesefluss account and are governed by the Lesefluss privacy policy at https://lesefluss.app/privacy.

**Contact**

Questions: jan.schmidt@rocketbase.io

---

# Notes to Reviewer

## Test account

The extension requires a Lesefluss account. Please use:

```
Email:    reviewer@lesefluss.app
Password: <set a fresh password before submitting>
```

The reviewer can sign in directly at https://lesefluss.app or via the extension's "Sign in with Lesefluss" button. The extension uses `browser.identity.launchWebAuthFlow` to obtain a bearer token from `https://lesefluss.app/auth/extension-callback`; no third-party OAuth provider is involved.

## What to test

1. Click the toolbar icon. Click "Sign in with Lesefluss". A Mozilla auth window opens, redirects to lesefluss.app, completes sign-in, and the popup flips to "Connected".
2. Navigate to any article (e.g. https://en.wikipedia.org/wiki/Reading). Click the toolbar icon. Click "Save this page". The popup confirms "Saved." Open https://lesefluss.app/app in a normal tab to see the article appear in the library after the next sync tick.
3. Select text on a page. Right-click. Choose "Save selection to Lesefluss". A native notification confirms the save.
4. Click the toolbar icon. Click "Sign out". The popup flips back to the signed-out state.

## Build instructions

The extension is built with WXT (https://wxt.dev), Vite, and pnpm workspaces. The source zip contains the entire repo. To reproduce the exact submitted artifact:

Requirements:

- Node.js 22.x
- pnpm 10.x (`npm install -g pnpm@10`)

Steps:

1. Unpack the source zip.
2. From the repo root: `pnpm install --frozen-lockfile`
3. From the repo root: `pnpm --filter @lesefluss/extension build:firefox`
4. The reproducible artifact is at `apps/extension/.output/firefox-mv3/`.

The submitted `.xpi` is the contents of that folder packaged with `pnpm --filter @lesefluss/extension zip:firefox`, which writes to `apps/extension/.output/firefox-mv3.zip`.

## Notes

- Source: https://github.com/sch-28/lesefluss
- License: AGPL-3.0
- The bundled `@mozilla/readability` runs inside the content script (`apps/extension/entrypoints/page-capture.content.ts`) to extract the article body before it is sent to the server. No code is loaded at runtime; everything is bundled at build time.
- The `data_collection_permissions` field declares `websiteContent` and `authenticationInfo`, matching the privacy policy.
