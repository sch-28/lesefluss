#!/usr/bin/env tsx
/**
 * Reads packages/ble-config/config-multibook.json and generates
 * apps/rsvpnano/src/ble/ble_config.h as a C++ constants header.
 *
 * Run via: pnpm setup (from monorepo root) or pnpm run setup (from this package)
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "..");
const repoRoot = resolve(packageRoot, "../..");

const configPath = resolve(packageRoot, "config-multibook.json");
const outputPath = resolve(repoRoot, "apps/rsvpnano/src/ble/ble_config.h");

interface MultibookConfig {
	protocol_version: number;
	device_name: string;
	service_uuid: string;
	characteristics: {
		info: { uuid: string; description: string };
		library: { uuid: string; description: string };
		active: { uuid: string; description: string };
		position: { uuid: string; description: string };
		transfer: { uuid: string; description: string };
		settings: { uuid: string; description: string };
		storage: { uuid: string; description: string };
		delete: { uuid: string; description: string };
	};
	transfer: {
		chunk_size: number;
		window_size: number;
		max_retries: number;
		ack_timeout_ms: number;
	};
}

const config: MultibookConfig = JSON.parse(readFileSync(configPath, "utf-8"));

const hpp = `// Auto-generated from packages/ble-config/config-multibook.json - DO NOT EDIT
// Re-generate by running: pnpm setup (from monorepo root)
#pragma once

#include <cstdint>

namespace lesefluss::ble {

constexpr int PROTOCOL_VERSION = ${config.protocol_version};
constexpr const char* DEVICE_NAME = "${config.device_name}";
constexpr const char* SERVICE_UUID = "${config.service_uuid}";
constexpr const char* INFO_CHAR_UUID = "${config.characteristics.info.uuid}";
constexpr const char* LIBRARY_CHAR_UUID = "${config.characteristics.library.uuid}";
constexpr const char* ACTIVE_CHAR_UUID = "${config.characteristics.active.uuid}";
constexpr const char* POSITION_CHAR_UUID = "${config.characteristics.position.uuid}";
constexpr const char* TRANSFER_CHAR_UUID = "${config.characteristics.transfer.uuid}";
constexpr const char* SETTINGS_CHAR_UUID = "${config.characteristics.settings.uuid}";
constexpr const char* STORAGE_CHAR_UUID = "${config.characteristics.storage.uuid}";
constexpr const char* DELETE_CHAR_UUID = "${config.characteristics.delete.uuid}";
constexpr uint32_t CHUNK_SIZE = ${config.transfer.chunk_size};
constexpr uint32_t WINDOW_SIZE = ${config.transfer.window_size};
constexpr uint32_t MAX_RETRIES = ${config.transfer.max_retries};
constexpr uint32_t ACK_TIMEOUT_MS = ${config.transfer.ack_timeout_ms};

} // namespace lesefluss::ble
`;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, hpp, "utf-8");
console.log(`Generated: ${outputPath}`);
