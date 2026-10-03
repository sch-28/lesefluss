/**
 * The script of the illustrated buddy-read preview shown in the app's Social
 * tab and on the website: three made-up readers and "You" stepping along one
 * shared track. Renderers own the look; this owns the timing and positions.
 */

export const BUDDY_TRAILER_TICK_MS = 550;
export const BUDDY_TRAILER_LAST_TICK = 15;
/** How far a rider moves, in track percent, each time their schedule says so. */
const STEP = 2;
/**
 * The ticks on which each rider steps forward. Everyone takes 8 steps on their
 * own rhythm, and nobody is ever more than one step ahead of anyone else: that
 * bound is what keeps the spacing below intact on every tick.
 */
const SCHEDULES = {
	Ali: [0, 2, 4, 6, 8, 10, 12, 14],
	Mia: [1, 3, 5, 7, 9, 11, 13, 15],
	Jo: [0, 3, 4, 7, 8, 11, 12, 15],
	self: [1, 2, 5, 6, 9, 10, 13, 14],
} as const;
const TRAVEL = STEP * SCHEDULES.self.length;
/** Closest two riders may get, in track percent: the track is ~170px and an avatar 30px. */
export const BUDDY_TRAILER_MIN_GAP = 18;
/** Final spacing: the minimum plus the one step a neighbour may be ahead mid-run. */
const SPACING = BUDDY_TRAILER_MIN_GAP + STEP;
/** The reader furthest along, who leaves the note and finishes the chapter. */
export const BUDDY_TRAILER_NOTE_READER = "Jo";
/** Ordered left to right along the track. */
export const BUDDY_TRAILER_READERS = ["Ali", "Mia", BUDDY_TRAILER_NOTE_READER] as const;
export type BuddyTrailerReader = (typeof BUDDY_TRAILER_READERS)[number];
/** Each caption shows from its tick on. */
const CAPTIONS: [number, string][] = [
	[0, "Everyone reads their own copy"],
	[3, "Mia picked up where she left off"],
	[6, "Jo left a note in chapter 11"],
	[8, "Jo reacted to chapter 11"],
	[11, "Ali caught up a little"],
	[13, "Jo finished chapter 12"],
	[BUDDY_TRAILER_LAST_TICK, "See where everyone is, live"],
];
export const BUDDY_TRAILER_BUBBLE_TICKS: readonly number[] = [8, 9, 10];
export const BUDDY_TRAILER_BURST_TICK = 13;

function stepsTaken(schedule: readonly number[], tick: number): number {
	return schedule.filter((t) => t <= tick).length;
}

export function buddyTrailerCaptionAt(tick: number): string {
	let caption = "";
	for (const [from, text] of CAPTIONS) if (from <= tick) caption = text;
	return caption;
}

export type BuddyTrailerRiderState = { percent: number; steps: number };

/**
 * Everyone's position and step count at `tick`, ending with "You" at
 * `selfPercent`. "You" travels less when there is no room below, and readers
 * ahead keep that difference as extra distance. Readers take the free spots
 * closest to "You".
 */
export function buddyTrailerPositions(
	selfPercent: number,
	tick: number,
): { self: BuddyTrailerRiderState; readers: BuddyTrailerRiderState[] } {
	const selfTravel = Math.min(TRAVEL, selfPercent);
	const spots: number[] = [];
	for (let p = selfPercent - SPACING; p >= TRAVEL; p -= SPACING) spots.push(p);
	for (let p = selfPercent + SPACING + TRAVEL - selfTravel; p <= 100; p += SPACING) spots.push(p);
	const readerEnds = spots
		.sort((a, b) => Math.abs(a - selfPercent) - Math.abs(b - selfPercent))
		.slice(0, BUDDY_TRAILER_READERS.length)
		.sort((a, b) => a - b);
	const selfSteps = stepsTaken(SCHEDULES.self, tick);
	return {
		self: {
			percent:
				selfPercent - selfTravel + Math.round((selfTravel * selfSteps) / SCHEDULES.self.length),
			steps: selfSteps,
		},
		readers: BUDDY_TRAILER_READERS.map((name, i) => {
			const steps = stepsTaken(SCHEDULES[name], tick);
			return { percent: (readerEnds[i] ?? 0) - TRAVEL + STEP * steps, steps };
		}),
	};
}
