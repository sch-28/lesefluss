/**
 * Settings characteristic - read/write RSVP settings JSON.
 * Characteristic 1: R/W
 *
 * The set of fields exchanged with the device — and their snake_case names —
 * is defined by ESP32_SETTING_KEYS in @lesefluss/rsvp-core. Adding a device
 * field there makes it flow through both directions automatically.
 */

import { BleClient } from "@capacitor-community/bluetooth-le";
import { SERVICE_UUID, SETTINGS_CHAR_UUID } from "@lesefluss/ble-config";
import { ESP32_SETTING_KEYS } from "@lesefluss/rsvp-core";
import type { Settings } from "../../db/schema";
import { bleClient } from "../client";
import type { BLEResult } from "../types";
import { dataViewToString, stringToDataView } from "../utils/encoding";

type AppKey = keyof typeof ESP32_SETTING_KEYS;
type DeviceFields = Pick<Settings, AppKey>;

const APP_KEYS = Object.keys(ESP32_SETTING_KEYS) as Array<AppKey>;

function toEsp32(s: DeviceFields): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const k of APP_KEYS) {
		out[ESP32_SETTING_KEYS[k]] = s[k];
	}
	return out;
}

function fromEsp32(json: Record<string, unknown>): Partial<DeviceFields> {
	const out: Partial<Record<AppKey, unknown>> = {};
	for (const k of APP_KEYS) {
		const espKey = ESP32_SETTING_KEYS[k];
		if (espKey in json) out[k] = json[espKey];
	}
	return out as Partial<DeviceFields>;
}

/** Read settings from the device and convert to app format. */
export async function readSettings(): Promise<BLEResult<Partial<Settings>>> {
	try {
		const device = bleClient.assertConnected();
		const dv = await BleClient.read(device.deviceId, SERVICE_UUID, SETTINGS_CHAR_UUID);
		const esp32 = JSON.parse(dataViewToString(dv)) as Record<string, unknown>;
		return { success: true, data: fromEsp32(esp32) };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to read settings",
		};
	}
}

type WriteableSettings = Omit<Settings, "id" | "updatedAt">;

/** Write app settings to the device. */
export async function writeSettings(settings: WriteableSettings): Promise<BLEResult> {
	try {
		const device = bleClient.assertConnected();
		await BleClient.write(
			device.deviceId,
			SERVICE_UUID,
			SETTINGS_CHAR_UUID,
			stringToDataView(JSON.stringify(toEsp32(settings))),
		);
		return { success: true };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to write settings",
		};
	}
}
