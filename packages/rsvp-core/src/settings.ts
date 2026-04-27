import type { SyncSettings } from "./sync";

/**
 * Default RSVP settings matching ESP32 config.py
 * These defaults are used when initializing the database.
 */

export const DEFAULT_SETTINGS = {
	WPM: 350, // Words per minute (100-1000)
	DELAY_COMMA: 2.0, // Multiplier for , ; : (1.0-5.0)
	DELAY_PERIOD: 3.0, // Multiplier for . ! ? (1.0-5.0)
	ACCEL_START: 2.0, // Initial delay multiplier (1.0-5.0, 2.0 = half speed)
	ACCEL_RATE: 0.1, // Acceleration rate (0.05-1.0, 0.1 = 10 words to full speed)
	X_OFFSET: 30, // Horizontal focal position % (30-70)
	WORD_OFFSET: 5, // Words to rewind on resume (0-20)
	INVERSE: false, // Inverse colors (false = white on black)
	BLE_ON: true, // BLE enabled for companion app
	DEV_MODE: false,
	DISPLAY_OFF_TIMEOUT: 60, // Seconds until display turns off (10-300)
	DEEP_SLEEP_TIMEOUT: 120, // Seconds until deep sleep from last activity (10-300)
	BRIGHTNESS: 100, // Backlight brightness % (10-100)
	// Reader appearance (stored in DB, applied in-app only)
	READER_THEME: "dark", // 'dark' | 'sepia' | 'light'
	READER_FONT_SIZE: 16, // px (12–28)
	READER_FONT_FAMILY: "sans", // 'sans' | 'serif'
	READER_LINE_SPACING: 1.8, // line-height multiplier (1.2–2.4)
	READER_MARGIN: 20, // horizontal padding px (8–48)
	READER_ACTIVE_WORD_UNDERLINE: true, // underline the currently active word in the scroll reader
	SHOW_READING_TIME: true, // show time remaining in progress bar
	DEFAULT_READER_MODE: "scroll", // 'scroll' | 'rsvp' - mode to open books in
	ONBOARDING_COMPLETED: false, // first-run onboarding completed on this device
} as const;

/**
 * Setting constraints matching ESP32 config
 */
export const SETTING_CONSTRAINTS = {
	WPM: { min: 100, max: 1000, step: 50 },
	DELAY_COMMA: { min: 1.0, max: 5.0, step: 0.1 },
	DELAY_PERIOD: { min: 1.0, max: 5.0, step: 0.1 },
	ACCEL_START: { min: 1.0, max: 5.0, step: 0.1 },
	ACCEL_RATE: { min: 0.05, max: 1.0, step: 0.05 },
	X_OFFSET: { min: 30, max: 70, step: 5 },
	WORD_OFFSET: { min: 0, max: 20, step: 1 },
	DISPLAY_OFF_TIMEOUT: { min: 10, max: 300, step: 10 },
	DEEP_SLEEP_TIMEOUT: { min: 10, max: 300, step: 10 },
	BRIGHTNESS: { min: 10, max: 100, step: 5 },
	READER_FONT_SIZE: { min: 12, max: 28, step: 2 },
	READER_LINE_SPACING: { min: 1.2, max: 2.4, step: 0.1 },
	READER_MARGIN: { min: 8, max: 48, step: 4 },
} as const;

/**
 * Keys present in SyncSettings — single source of truth for which fields cross
 * the wire between client and server. The `satisfies` clause makes TypeScript
 * error if SyncSettings gains or loses a field that isn't reflected here.
 */
export const SYNCED_SETTING_KEYS = [
	"wpm",
	"delayComma",
	"delayPeriod",
	"accelStart",
	"accelRate",
	"xOffset",
	"wordOffset",
	"readerTheme",
	"readerFontSize",
	"readerFontFamily",
	"readerLineSpacing",
	"readerMargin",
	"showReadingTime",
	"readerActiveWordUnderline",
	"defaultReaderMode",
] as const satisfies readonly (keyof Omit<SyncSettings, "updatedAt">)[];

/**
 * App camelCase → ESP32 snake_case for the fields the device cares about.
 * Drives the BLE Settings characteristic read/write mapping.
 */
export function pick<T, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
	const out = {} as Pick<T, K>;
	for (const k of keys) out[k] = obj[k];
	return out;
}

export const ESP32_SETTING_KEYS = {
	wpm: "wpm",
	delayComma: "delay_comma",
	delayPeriod: "delay_period",
	accelStart: "accel_start",
	accelRate: "accel_rate",
	xOffset: "x_offset",
	wordOffset: "word_offset",
	inverse: "inverse",
	bleOn: "ble_on",
	devMode: "dev_mode",
	displayOffTimeout: "display_off_timeout",
	deepSleepTimeout: "deep_sleep_timeout",
	brightness: "brightness",
} as const;
