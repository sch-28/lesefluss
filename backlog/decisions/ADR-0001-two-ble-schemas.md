# ADR-0001: Two BLE schemas, esp32 stays single-book

Date: 2026-05-20
Status: Accepted

## Context

Lesefluss supports two BLE reader devices:

- The lesefluss esp32, a button-only RSVP reader we built. One book on flash at a time. Firmware is MicroPython.
- The rsvpnano (third-party MIT project, vendored at `apps/rsvpnano`), an ESP32-S3 with a capacitive touch display and SD card. Multiple books on disk, on-device library browser.

When integrating rsvpnano we considered two BLE contracts:

1. **One unified multi-book schema.** Both devices expose a `library` characteristic. The esp32 would advertise a one-entry library. App speaks one protocol.
2. **Two parallel schemas.** Esp32 keeps its single-book schema. Rsvpnano gets a separate multi-book schema with its own service UUID. App holds two descriptors (see TASK-131.4 for the transport architecture).

## Decision

We keep two schemas. The esp32 stays single-book and is not migrated to the multi-book protocol.

## Reasons

- **No on-device book picker.** The esp32 has buttons only. No touch, no screen real estate for a library list. A multi-book device that can't show its own library is a multi-book device only on paper.
- **Porting cost.** Multi-book on the esp32 implies a filesystem layout, per-book progress storage in NVS, and library listing over BLE. All unjustified work for one functional book at a time.
- **Limited flash.** The esp32 holds one book by design. The hardware constraint matches the protocol.
- **No upstream pressure.** The rsvpnano fork already lives under our control (`sch-28/rsvpnano-lesefluss`, branch `lesefluss-ble`). Its BLE schema is ours to shape independently.

## Consequences

- The TS BLE config package (`packages/ble-config`) ships two descriptors: `singleBook` and `multibook`.
- The capacitor app's BLE transport (`services/ble-transport/`) is descriptor-driven. Both schemas coexist behind one transport (TASK-131.4).
- Some duplication of constants (chunk size, ack framing) across the two JSON config files is accepted. The alternative, a unified schema, costs more in firmware work than it saves in JSON lines.
- If a future esp32 hardware revision gains a screen or touch input, this decision is open to revisit.

## Not revisiting

Architecture passes (`/improve-codebase-architecture`) should not re-propose unifying the schemas without new evidence: specifically, hardware changes on the esp32 side or a new device class that would actually benefit.
