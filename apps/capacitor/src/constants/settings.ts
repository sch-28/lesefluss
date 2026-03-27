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
	CURRENT_SLOT: 1, // Active book slot (1-4)
	DEV_MODE: false,
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
	CURRENT_SLOT: { min: 1, max: 4, step: 1 },
} as const;
