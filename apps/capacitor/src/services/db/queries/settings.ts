import { changelog, DEFAULT_SETTINGS } from "@lesefluss/rsvp-core";
import { eq } from "drizzle-orm";
import { db } from "../index";
import { type Settings, settings } from "../schema";

const SETTINGS_ID = 1;

/**
 * Fetch the single settings row (id=1), inserting defaults if it doesn't exist yet.
 */
export async function getSettings(): Promise<Settings> {
	const rows = await db.select().from(settings).where(eq(settings.id, SETTINGS_ID));

	if (rows.length > 0) return rows[0];

	// First run - seed defaults
	const defaults = {
		id: SETTINGS_ID,
		wpm: DEFAULT_SETTINGS.WPM,
		delayComma: DEFAULT_SETTINGS.DELAY_COMMA,
		delayPeriod: DEFAULT_SETTINGS.DELAY_PERIOD,
		accelStart: DEFAULT_SETTINGS.ACCEL_START,
		accelRate: DEFAULT_SETTINGS.ACCEL_RATE,
		xOffset: DEFAULT_SETTINGS.X_OFFSET,
		focalLetterColor: DEFAULT_SETTINGS.FOCAL_LETTER_COLOR,
		wordOffset: DEFAULT_SETTINGS.WORD_OFFSET,
		inverse: DEFAULT_SETTINGS.INVERSE,
		bleOn: DEFAULT_SETTINGS.BLE_ON,
		devMode: DEFAULT_SETTINGS.DEV_MODE,
		displayOffTimeout: DEFAULT_SETTINGS.DISPLAY_OFF_TIMEOUT,
		deepSleepTimeout: DEFAULT_SETTINGS.DEEP_SLEEP_TIMEOUT,
		brightness: DEFAULT_SETTINGS.BRIGHTNESS,
		readerTheme: DEFAULT_SETTINGS.READER_THEME,
		readerFontSize: DEFAULT_SETTINGS.READER_FONT_SIZE,
		readerFontFamily: DEFAULT_SETTINGS.READER_FONT_FAMILY,
		readerLineSpacing: DEFAULT_SETTINGS.READER_LINE_SPACING,
		readerMargin: DEFAULT_SETTINGS.READER_MARGIN,
		readerActiveWordUnderline: DEFAULT_SETTINGS.READER_ACTIVE_WORD_UNDERLINE,
		readerGlossaryUnderline: DEFAULT_SETTINGS.READER_GLOSSARY_UNDERLINE,
		showReadingTime: DEFAULT_SETTINGS.SHOW_READING_TIME,
		defaultReaderMode: DEFAULT_SETTINGS.DEFAULT_READER_MODE,
		paginationStyle: DEFAULT_SETTINGS.PAGINATION_STYLE,
		onboardingCompleted: DEFAULT_SETTINGS.ONBOARDING_COMPLETED,
		appFontSize: DEFAULT_SETTINGS.APP_FONT_SIZE,
		// Fresh installs start "caught up" — only changelog entries published
		// after install will appear in the What's New dialog.
		lastSeenChangelogDate: changelog[0]?.date ?? "",
		updatedAt: Date.now(),
	};

	await db.insert(settings).values(defaults);
	return defaults;
}

/**
 * Persist updated settings. Only call with fields you want to change -
 * updatedAt is always set automatically.
 */
export async function saveSettings(
	patch: Partial<Omit<Settings, "id" | "updatedAt">>,
): Promise<void> {
	await db
		.update(settings)
		.set({ ...patch, updatedAt: Date.now() })
		.where(eq(settings.id, SETTINGS_ID));
}
