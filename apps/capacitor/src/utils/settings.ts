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
	X_OFFSET: 50, // Horizontal focal position % (30-70, 50 = center)
	WORD_OFFSET: 5, // Words to rewind on resume (0-20)
	INVERSE: false, // Inverse colors (false = white on black)
	BLE_ON: true, // BLE enabled for companion app
	DEV_MODE: false,
	DISPLAY_OFF_TIMEOUT: 60, // Seconds until display turns off (10-300)
	DEEP_SLEEP_TIMEOUT: 120, // Seconds until deep sleep from last activity (10-300)
	BRIGHTNESS: 100, // Backlight brightness % (10-100)
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
} as const;
