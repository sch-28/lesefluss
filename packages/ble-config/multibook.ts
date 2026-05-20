/**
 * Multibook BLE schema for the rsvpnano device.
 *
 * Separate from the single-book schema in `./index.ts` (which targets the
 * lesefluss esp32 firmware). Fresh UUIDs, multi-book characteristic set.
 *
 * Consumers: `import { multibook } from "@lesefluss/ble-config"`.
 */

import config from "./config-multibook.json" with { type: "json" };

export type MultibookLibraryEntry = {
	/** 8-char hex FNV-1a of the SD path. Stable across reboots, used as primary key. */
	hash: string;
	title: string;
	author: string;
	words: number;
	progressWords: number;
	category: "book" | "article";
};

export type MultibookPosition = {
	hash: string;
	wordIndex: number;
};

export type MultibookTransferHeader = {
	filename: string;
	category: "book" | "article";
	sizeBytes: number;
};

export type MultibookInfo = {
	deviceName: string;
	fwVersion: string;
	protoVersion: number;
};

export type MultibookStorage = {
	freeBytes: number;
	totalBytes: number;
	bookCount: number;
};

// Settings shape mirrors rsvpnano `settingsJson()` (CompanionSyncManager.cpp:1048-1110).
// Sub-paths: reading.{wpm, readerMode, pauseMode, accurateTimeEstimate, pacing.*},
// display.{brightnessIndex, darkMode, nightMode, handedness, footerMetric, batteryLabel,
// readingBattery, readingChapter, readingProgress, language, phantomWords, fontSizeIndex},
// typography.{typeface, focusHighlight, tracking, anchorPercent, guideWidth, guideGap},
// limits.{...}. Tighten when TASK-131.4 consumes individual fields.
export type MultibookSettings = Record<string, unknown>;

export const multibook = {
	protocolVersion: config.protocol_version,
	deviceName: config.device_name,
	serviceUuid: config.service_uuid,
	characteristics: config.characteristics,
	transfer: {
		chunkSize: config.transfer.chunk_size,
		windowSize: config.transfer.window_size,
		maxRetries: config.transfer.max_retries,
		ackTimeoutMs: config.transfer.ack_timeout_ms,
	},
} as const;
