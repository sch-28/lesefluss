# Lesefluss Browser Extension

Cross-browser WXT extension for saving web pages and selected text into a signed-in Lesefluss library.

## Development

```bash
pnpm --filter @lesefluss/extension dev
pnpm --filter @lesefluss/extension dev:firefox
```

Set `WXT_PUBLIC_LESEFLUSS_URL` to point at a local or staging web app:

```bash
WXT_PUBLIC_LESEFLUSS_URL=http://localhost:3000 pnpm --filter @lesefluss/extension dev
```

## Builds

```bash
pnpm --filter @lesefluss/extension build
pnpm --filter @lesefluss/extension build:firefox
pnpm --filter @lesefluss/extension zip
pnpm --filter @lesefluss/extension zip:firefox
```

WXT writes build artifacts to `.output/`.

## Icons

Extension icons are generated from `resources/logo.png` by the root icon script:

```bash
pnpm gen-icons
```

For this package only, run `pnpm --filter @lesefluss/extension gen-icons`.

This writes `apps/extension/public/icon-*.png` and `apps/extension/public/logo.png`.

