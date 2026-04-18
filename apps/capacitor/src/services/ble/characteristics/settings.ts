/**
 * Settings characteristic - read/write RSVP settings JSON.
 * Characteristic 1: R/W
 */

import { BleClient } from "@capacitor-community/bluetooth-le";
import { SERVICE_UUID, SETTINGS_CHAR_UUID } from "@lesefluss/ble-config";
import type { Settings } from "../../db/schema";
import { bleClient } from "../client";
import type { BLEResult } from "../types";
import { dataViewToString, stringToDataView } from "../utils/encoding";

/** Shape of the JSON the ESP32 sends/receives. */
interface ESP32Settings {
	wpm: number;
	delay_comma: number;
	delay_period: number;
	accel_start: number;
	accel_rate: number;
	x_offset: number;
	word_offset: number;
	inverse: boolean;
	ble_on: boolean;
	dev_mode: boolean;
	display_off_timeout: number;
	deep_sleep_timeout: number;
	brightness: number;
}

/** Read settings from the device and convert to app format. */
export async function readSettings(): Promise<BLEResult<Partial<Settings>>> {
	try {
		const device = bleClient.assertConnected();
		const dv = await BleClient.read(device.deviceId, SERVICE_UUID, SETTINGS_CHAR_UUID);
		const esp32: ESP32Settings = JSON.parse(dataViewToString(dv));

		return {
			success: true,
			data: {
				wpm: esp32.wpm,
				delayComma: esp32.delay_comma,
				delayPeriod: esp32.delay_period,
				accelStart: esp32.accel_start,
				accelRate: esp32.accel_rate,
				xOffset: esp32.x_offset,
				wordOffset: esp32.word_offset,
				inverse: esp32.inverse,
				bleOn: esp32.ble_on,
				devMode: esp32.dev_mode,
				displayOffTimeout: esp32.display_off_timeout,
				deepSleepTimeout: esp32.deep_sleep_timeout,
				brightness: esp32.brightness,
			},
		};
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

		const esp32: ESP32Settings = {
			wpm: settings.wpm,
			delay_comma: settings.delayComma,
			delay_period: settings.delayPeriod,
			accel_start: settings.accelStart,
			accel_rate: settings.accelRate,
			x_offset: settings.xOffset,
			word_offset: settings.wordOffset,
			inverse: settings.inverse,
			ble_on: settings.bleOn,
			dev_mode: settings.devMode,
			display_off_timeout: settings.displayOffTimeout,
			deep_sleep_timeout: settings.deepSleepTimeout,
			brightness: settings.brightness,
		};

		await BleClient.write(
			device.deviceId,
			SERVICE_UUID,
			SETTINGS_CHAR_UUID,
			stringToDataView(JSON.stringify(esp32)),
		);

		return { success: true };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to write settings",
		};
	}
}
