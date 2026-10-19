import { addDays, dayKeyOf, dayNumberOf } from "./day-key";

/** A sitting before this local hour also counts for the previous day, so a
 *  day's reading window runs from midnight to this hour the next morning. */
const LATE_NIGHT_CUTOFF_HOUR = 4;

/** Read days that earn one streak freeze. */
const READ_DAYS_PER_FREEZE = 7;

const MAX_BANKED_FREEZES = 2;

export interface StreakResult {
	current: number;
	longest: number;
	/** Missed days a freeze covered, as `YYYY-MM-DD`, oldest first. */
	frozenDays: string[];
	freezesBanked: number;
}

/** The day before a `YYYY-MM-DD` key. */
export function previousDayKey(key: string): string {
	return addDays(key, -1);
}

/** The days a sitting at this local date and hour counts toward. */
export function readingDayKeys(localDateKey: string, localHour: number): string[] {
	return localHour < LATE_NIGHT_CUTOFF_HOUR
		? [previousDayKey(localDateKey), localDateKey]
		: [localDateKey];
}

/**
 * Current and longest streak over `readDays`, `YYYY-MM-DD` reading days in the
 * reader's own time zone.
 *
 * Every READ_DAYS_PER_FREEZE read days earn a freeze. A gap no longer than the
 * banked freezes is bridged and its days count toward the streak; a longer gap
 * breaks it and spends nothing. Missed days since the last read day are covered
 * too but only count once reading resumes, so neither figure shrinks without a
 * break. Replaying the history rather than storing a balance keeps the app and
 * the server profile in agreement.
 *
 * Days from `openSinceKey` through today can still be read, so an unread one
 * there is not missed yet. That is today, and yesterday as well before
 * LATE_NIGHT_CUTOFF_HOUR: the first of `readingDayKeys` for the current moment.
 *
 * Walks read days rather than calendar days and ignores keys that do not parse:
 * a synced session with an absurd timestamp must not stall a profile view.
 */
export function streakFromDays(
	readDays: ReadonlySet<string>,
	todayKey: string,
	openSinceKey: string = todayKey,
): StreakResult {
	const today = dayNumberOf(todayKey);
	const openSince = dayNumberOf(openSinceKey) ?? today;
	const noStreak: StreakResult = { current: 0, longest: 0, frozenDays: [], freezesBanked: 0 };
	if (today === null || openSince === null) return noStreak;

	const days = [...readDays]
		.map(dayNumberOf)
		.filter((day): day is number => day !== null && day <= today)
		.sort((a, b) => a - b);

	let run = 0;
	let longest = 0;
	let freezesBanked = 0;
	let readSinceLastFreeze = 0;
	let lastRead: number | null = null;
	const frozenDays: string[] = [];

	const freezeDaysBetween = (from: number, to: number) => {
		for (let day = from + 1; day < to; day++) frozenDays.push(dayKeyOf(day));
	};

	for (const day of days) {
		if (lastRead !== null) {
			const missed = day - lastRead - 1;
			if (missed > freezesBanked) {
				run = 0;
				freezesBanked = 0;
				readSinceLastFreeze = 0;
			} else if (missed > 0) {
				freezesBanked -= missed;
				run += missed;
				freezeDaysBetween(lastRead, day);
			}
		}

		run++;
		longest = Math.max(longest, run);
		readSinceLastFreeze++;
		if (readSinceLastFreeze === READ_DAYS_PER_FREEZE) {
			freezesBanked = Math.min(MAX_BANKED_FREEZES, freezesBanked + 1);
			readSinceLastFreeze = 0;
		}
		lastRead = day;
	}

	if (lastRead === null) return noStreak;

	const missedSinceLastRead = Math.max(0, openSince - 1 - lastRead);
	if (missedSinceLastRead > freezesBanked) {
		return { current: 0, longest, frozenDays, freezesBanked: 0 };
	}
	freezeDaysBetween(lastRead, lastRead + missedSinceLastRead + 1);
	return {
		current: run,
		longest,
		frozenDays,
		freezesBanked: freezesBanked - missedSinceLastRead,
	};
}
