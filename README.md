# Lesefluss

An app, website and esp32 software all in one. Lesefluss allows you to read in multiple different ways, with the focus on reading without distractions.
RSVP (rapid serial visual presentation) allows you to read without moving your eyes, by flashing one word at a time in the same spot. This can boost reading speed by 2-4x.
The esp32 device, the app and the website can all sync, sharing your books and progress. The app also has a normal reading mode, allowing you to seamlessly switch between focused RSVP and regular reading.

You can only add DRM-free EPUBS or text files to the app.
But I also added an explore page for public-domain books from [Project Gutenberg](https://www.gutenberg.org) and [Standard Ebooks](https://standardebooks.org), so you can start reading something right away without hunting down EPUBs yourself.

Website: [lesefluss.app](https://lesefluss.app)
Docs and build guide: [lesefluss.app/docs](https://lesefluss.app/docs)

## Repository layout

```
apps/
  esp32/       MicroPython firmware for the handheld reader
  capacitor/   Ionic React app (Android and web)
  web/         TanStack Start website, auth, cloud sync
  catalog/     Hono service for public-domain book discovery
packages/
  ble-config/  Shared BLE UUIDs
  rsvp-core/   Shared RSVP engine, settings, sync types
resources/
  case/        3D-printable cases for the ESP32 variants
```

## Getting started

```bash
pnpm install
pnpm setup:project
```

Running the app:

```bash
cd apps/capacitor
pnpm start
```

Flashing the ESP32 firmware is covered in the
[build guide](https://lesefluss.app/docs?tab=esp32-build-guide).

## License

[AGPL-3.0](LICENSE). You can use, modify, and self-host Lesefluss freely. If
you run a modified version as a service or distribute your changes, you need
to share the source under the same license.
