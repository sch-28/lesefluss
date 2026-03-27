#!/usr/bin/env tsx
/**
 * Reads packages/ble-config/config.json and generates
 * apps/esp32/src/ble_config.py as a MicroPython-compatible constants module.
 *
 * Run via: pnpm setup (from monorepo root) or pnpm run setup (from this package)
 */

import { readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "..");
const repoRoot = resolve(packageRoot, "../..");

const configPath = resolve(packageRoot, "config.json");
const outputPath = resolve(repoRoot, "apps/esp32/src/ble/ble_config.py");

interface BleConfig {
	protocol_version: number;
	device_name: string;
	service_uuid: string;
	characteristics: {
		settings: { uuid: string; description: string };
		slot_info: { uuid: string; description: string };
		file_transfer: { uuid: string; description: string };
	};
	transfer: {
		chunk_size: number;
		max_retries: number;
		ack_timeout_ms: number;
	};
}

const config: BleConfig = JSON.parse(readFileSync(configPath, "utf-8"));

const py = `# Auto-generated from packages/ble-config/config.json — DO NOT EDIT
# Re-generate by running: pnpm setup (from monorepo root)

PROTOCOL_VERSION = ${config.protocol_version}
DEVICE_NAME = "${config.device_name}"
SERVICE_UUID = "${config.service_uuid}"
SETTINGS_CHAR_UUID = "${config.characteristics.settings.uuid}"
SLOT_INFO_CHAR_UUID = "${config.characteristics.slot_info.uuid}"
FILE_TRANSFER_CHAR_UUID = "${config.characteristics.file_transfer.uuid}"
CHUNK_SIZE = ${config.transfer.chunk_size}
MAX_RETRIES = ${config.transfer.max_retries}
ACK_TIMEOUT_MS = ${config.transfer.ack_timeout_ms}
`;

writeFileSync(outputPath, py, "utf-8");
console.log(`Generated: ${outputPath}`);
