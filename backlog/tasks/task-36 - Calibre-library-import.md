---
id: TASK-36
title: Calibre library import
status: To Do
assignee: []
created_date: '2026-04-27 15:59'
updated_date: '2026-04-27 15:21'
labels: []
milestone: m-4
dependencies: []
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add Calibre interoperability so users can move books between their Calibre library and the Lesefluss app. Two complementary directions are on the table — pick one or ship both in phases.

## Option A — Calibre Content Server (OPDS, network-based)

User runs Calibre on their desktop with the Content Server enabled, then pastes the server URL into the app. App browses the OPDS feed and lets the user select books to download.

- Mobile-friendly (works on Android + iOS + web).
- Reuses the existing URL fetch / catalog proxy plumbing — books arrive as EPUBs and pass straight through the existing parser pipeline.
- Selective import (browse + pick), not all-or-nothing.
- Requires the desktop to be running with the server enabled and reachable on the network.
- Architecturally introduces a multi-book source: needs an `AsyncIterable<RawInput>` (or `AsyncIterable<BookPayload>`) shape and a batch runner around `runImportPipeline`, with per-item progress and per-item failure isolation.

## Option B — Phone as a Calibre device (USB / MTP, local computer)

User plugs phone into computer; Calibre detects it as a device and pushes/removes books via its device pane (drag-and-drop in Calibre's UI).

How Calibre device detection works: it ships device drivers keyed on USB vendor/product ID + a folder layout marker, and has a generic Android MTP driver that targets a configured folder.

Two layers of polish:

1. **MVP — generic MTP folder watch.** Reserve a folder (e.g. `Android/data/app.lesefluss/files/Books/` or top-level `Lesefluss/` on shared storage). User points Calibre's generic Android driver at that folder once. Books Calibre sends land as `.epub`; app scans the folder on resume/startup and imports new ones through the existing pipeline. Reconciliation pass: tracked-as-imported file no longer present → delete book row.
2. **Polished — custom Calibre plugin.** Ship a Python plugin in `tools/calibre-plugin/` that registers "Lesefluss" as a named device (matched via USB IDs or a marker file the app drops). Plugin auto-configures the upload folder, shows correct device name/icon, and optionally exposes book metadata so Calibre's "on device" column works. Distributed separately (mobileread / docs link).

Tradeoffs:
- Android-only — iOS has no MTP equivalent.
- Web app: not applicable.
- Need to decide: keep file in watched folder as source of truth, or copy into app-private storage and delete original?
- Two-way (read position back to Calibre) is out of scope without the plugin.

## Recommendation

Start with **Option A (OPDS)** as the primary path — broadest reach, lowest friction, no desktop-side install. Add **Option B MVP (folder watch)** as a follow-up for users who want offline / no-network sync. Custom Calibre plugin is a later polish step gated on demand.

## Open questions

- Which option ships first (or both)?
- Source-of-truth question for Option B: in-place watched folder vs copy-and-delete.
- Is two-way sync (read position back to Calibre) in scope?</description>
</invoke>
<!-- SECTION:DESCRIPTION:END -->
