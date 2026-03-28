import { eq } from "drizzle-orm";
import { DEFAULT_SETTINGS } from "../../../constants/settings";
import { db } from "../index";
import { type Settings, settings } from "../schema";

const SETTINGS_ID = 1;

/**
 * Fetch the single settings row (id=1), inserting defaults if it doesn't exist yet.
 */
export async function getSettings(): Promise<Settings> {
	const rows = await db.select().from(settings).where(eq(settings.id, SETTINGS_ID));

	if (rows.length > 0) return rows[0];

	// First run — seed defaults
	const defaults = {
		id: SETTINGS_ID,
		wpm: DEFAULT_SETTINGS.WPM,
		delayComma: DEFAULT_SETTINGS.DELAY_COMMA,
		delayPeriod: DEFAULT_SETTINGS.DELAY_PERIOD,
		accelStart: DEFAULT_SETTINGS.ACCEL_START,
		accelRate: DEFAULT_SETTINGS.ACCEL_RATE,
		xOffset: DEFAULT_SETTINGS.X_OFFSET,
		wordOffset: DEFAULT_SETTINGS.WORD_OFFSET,
		inverse: DEFAULT_SETTINGS.INVERSE,
		bleOn: DEFAULT_SETTINGS.BLE_ON,
		devMode: DEFAULT_SETTINGS.DEV_MODE,
		updatedAt: Date.now(),
	};

	await db.insert(settings).values(defaults);
	return defaults;
}

/**
 * Persist updated settings. Only call with fields you want to change —
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
