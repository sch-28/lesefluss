/**
 * Unified BLE characteristics object — import `ble` anywhere and call e.g.
 * `ble.readSettings()`, `ble.transferBook(...)`.
 *
 * Individual modules stay as pure functions; this re-exports them under one
 * namespace so callers have a single import (mirrors the `queries` pattern).
 */

import { readPosition, writePosition } from "./position";
import { readSettings, writeSettings } from "./settings";
import { readStorage } from "./storage";
import { transferBook } from "./transfer";

export const ble = {
	// Settings characteristic (R/W)
	readSettings,
	writeSettings,

	// Position characteristic (R/W)
	readPosition,
	writePosition,

	// File transfer characteristic (Write + Notify)
	transferBook,

	// Storage characteristic (R)
	readStorage,
};
