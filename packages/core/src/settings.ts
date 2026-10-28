import type { SyncSettings } from "./sync";

/** Layout variant of the standard (non-RSVP) reader. */
export type PaginationStyle = "scroll" | "page";

export type HexColor = `#${string}`;

export const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

export const READER_THEMES = ["dark", "sepia", "light", "high-contrast"] as const;
export type ReaderTheme = (typeof READER_THEMES)[number];

export const FOCAL_LETTER_COLOR_PRESETS = [
	"#ff0000",
	"#ff8a00",
	"#ffcc00",
	"#00c853",
	"#448aff",
	"#b388ff",
] as const satisfies readonly HexColor[];

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
	FOCAL_LETTER_COLOR: "#ff0000", // Focal letter highlight color
	WORD_OFFSET: 5, // Words to rewind on resume (0-20)
	INVERSE: false, // Inverse colors (false = white on black)
	BLE_ON: true, // BLE enabled for companion app
	DEV_MODE: false,
	DISPLAY_OFF_TIMEOUT: 60, // Seconds until display turns off (10-300)
	DEEP_SLEEP_TIMEOUT: 120, // Seconds until deep sleep from last activity (10-300)
	BRIGHTNESS: 100, // Backlight brightness % (10-100)
	// Reader appearance (stored in DB, applied in-app only)
	READER_THEME: "dark", // 'dark' | 'sepia' | 'light' | 'high-contrast'
	READER_FONT_SIZE: 16, // px (12–28)
	READER_FONT_FAMILY: "sans", // 'sans' | 'serif' | 'atkinson' | 'opendyslexic' | 'literata'
	READER_BOLD: false, // bold body text in the scroll and page reader
	READER_TEXT_ALIGN: "left", // 'left' | 'justify'
	READER_RULER: false, // reading ruler: band on the active (or spoken) word's line, rest dimmed
	READER_RULER_LINES: 1, // lines the ruler band covers (1–3); kept while the ruler is off
	READER_LINE_SPACING: 1.8, // line-height multiplier (1.2–2.4)
	READER_MARGIN: 20, // horizontal padding px (8–48)
	READER_LETTER_SPACING: 0, // em added between letters (0–0.2)
	READER_WORD_SPACING: 0, // em added between words (0–0.48)
	READER_PARAGRAPH_SPACING: 1.1, // em between paragraphs (0.5–2.9)
	READER_ACTIVE_WORD_UNDERLINE: true, // underline the currently active word in the scroll reader
	READER_GLOSSARY_UNDERLINE: true, // underline words that match a glossary entry label
	SHOW_READING_TIME: true, // show time remaining in progress bar
	DEFAULT_READER_MODE: "scroll", // 'scroll' | 'rsvp' - mode to open books in
	PAGINATION_STYLE: "scroll", // 'scroll' | 'page' - layout for the standard (non-RSVP) reader
	ONBOARDING_COMPLETED: false, // first-run onboarding completed on this device
	APP_FONT_SIZE: 16, // px (12–22) - root font-size driving rem-scaled UI
	LAST_SEEN_CHANGELOG_DATE: "", // ISO date of newest changelog entry user has seen ('' = never)
	PAGE_TURN_ANIMATION: true, // slide between pages in page mode (off suits e-ink); device-local
	AUTO_OPEN_LAST_BOOK: false, // open the most recently read book on app launch; device-local
	EINK_MODE: false, // static, high-contrast UI with instant page turns for e-ink screens; device-local
	VOLUME_KEY_INVERT: false, // volume up turns forward instead of down; device-local
	// Read aloud (device-local: voices belong to the phone's speech engine)
	TTS_WPM: 180, // read-aloud speed in words per minute
	TTS_PITCH: 1.0, // voice pitch multiplier
	TTS_REWIND_WORDS: 8, // words repeated after an interruption
	TTS_VOICES: "{}", // JSON: primary language → chosen voice name
	TTS_FOLLOW: true, // keep the spoken word in view
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
	// Grids put WCAG 1.4.12's text spacing (0.12 / 0.16 / 2 em) exactly on a step.
	READER_LETTER_SPACING: { min: 0, max: 0.2, step: 0.04 },
	READER_WORD_SPACING: { min: 0, max: 0.48, step: 0.04 },
	READER_PARAGRAPH_SPACING: { min: 0.5, max: 2.9, step: 0.3 },
	READER_RULER_LINES: { min: 1, max: 3, step: 1 },
	APP_FONT_SIZE: { min: 12, max: 22, step: 1 },
	TTS_WPM: { min: 80, max: 500, step: 10 },
	TTS_PITCH: { min: 0.5, max: 2.0, step: 0.1 },
	TTS_REWIND_WORDS: { min: 0, max: 30, step: 1 },
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
	"focalLetterColor",
	"wordOffset",
	"readerTheme",
	"readerFontSize",
	"readerFontFamily",
	"readerBold",
	"readerTextAlign",
	"readerRuler",
	"readerRulerLines",
	"readerLineSpacing",
	"readerMargin",
	"readerLetterSpacing",
	"readerWordSpacing",
	"readerParagraphSpacing",
	"showReadingTime",
	"readerActiveWordUnderline",
	"readerGlossaryUnderline",
	"defaultReaderMode",
	"paginationStyle",
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
	focalLetterColor: "focal_letter_color",
	wordOffset: "word_offset",
	inverse: "inverse",
	bleOn: "ble_on",
	devMode: "dev_mode",
	displayOffTimeout: "display_off_timeout",
	deepSleepTimeout: "deep_sleep_timeout",
	brightness: "brightness",
} as const;
