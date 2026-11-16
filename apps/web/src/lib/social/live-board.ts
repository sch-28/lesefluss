import {
	LIVE_IDLE_MS,
	LIVE_MIN_SITTING_MS,
	LIVE_STILL_READING_MS,
	type LiveMember,
	type LiveReport,
	type ReadingMode,
	refillCredit,
	spendCredit,
} from "@lesefluss/core";

/**
 * Refill is capped per report so a reader who pauses and then jumps ahead
 * cannot bank a whole idle window of credit.
 */
const MAX_REFILL_MS = 10_000;

/**
 * Time a move adds to the sitting: the whole stretch since the last move while
 * that is still reading, else only the latest report's gap, since the reader
 * was paused before it.
 */
function activeGain(prev: Reader, mode: ReadingMode, now: number): number {
	const still = now - prev.lastMovedAt;
	if (still <= LIVE_STILL_READING_MS[mode]) return still;
	return Math.min(now - prev.lastSeenAt, MAX_REFILL_MS);
}

type Reader = {
	position: number;
	wordCount: number;
	lastSeenAt: number;
	/** Reading time in the sitting: pauses past the mode's still allowance stay out. */
	activeMs: number;
	/** When the position last changed. */
	lastMovedAt: number;
	mode: ReadingMode;
	credited: number;
	budget: number;
	/** The client's send time of the latest report, when the client sends one. */
	lastSentAt: number | null;
};

/**
 * Who is reading which buddy read right now, in memory only. Speed is the
 * words credited in the current sitting over its active time, credited with the
 * reading tracker's plausibility rule.
 */
export class LiveBoard {
	private readonly reads = new Map<string, Map<string, Reader>>();

	constructor(private readonly onChange: (buddyReadId: string) => void) {}

	report(
		buddyReadId: string,
		userId: string,
		report: LiveReport,
		wordCount: number,
		now: number,
	): void {
		const readers = this.reads.get(buddyReadId) ?? new Map<string, Reader>();
		this.reads.set(buddyReadId, readers);
		const prev = readers.get(userId);
		// Listening moves at the voice's pace: switching to or from it starts a new
		// sitting, so the voice's words never count toward a reading speed.
		const isListeningSwitch =
			prev !== undefined &&
			prev.mode !== report.mode &&
			(prev.mode === "listen" || report.mode === "listen");
		if (!prev || now - prev.lastSeenAt > LIVE_IDLE_MS || isListeningSwitch) {
			readers.set(userId, {
				position: report.position,
				wordCount,
				lastSeenAt: now,
				activeMs: 0,
				lastMovedAt: now,
				mode: report.mode,
				credited: 0,
				budget: 0,
				lastSentAt: report.sentAt ?? null,
			});
		} else {
			const elapsed = Math.min(now - prev.lastSeenAt, MAX_REFILL_MS);
			const refilled = refillCredit(prev.budget, report.mode, report.dialWpm, elapsed);
			const spent = spendCredit(refilled, prev.position, report.position);
			const hasMoved = report.position !== prev.position;
			readers.set(userId, {
				...prev,
				activeMs: hasMoved ? prev.activeMs + activeGain(prev, report.mode, now) : prev.activeMs,
				lastMovedAt: hasMoved ? now : prev.lastMovedAt,
				position: report.position,
				mode: report.mode,
				wordCount,
				lastSeenAt: now,
				credited: prev.credited + spent.credited,
				budget: spent.budget,
				lastSentAt: report.sentAt ?? prev.lastSentAt,
			});
		}
		this.onChange(buddyReadId);
	}

	/**
	 * A stop the client sent before its latest report arrived out of order and
	 * is ignored, so the reader does not vanish until their next report.
	 */
	stop(buddyReadId: string, userId: string, sentAt?: number): void {
		const readers = this.reads.get(buddyReadId);
		const r = readers?.get(userId);
		if (!readers || !r) return;
		if (sentAt !== undefined && r.lastSentAt !== null && sentAt < r.lastSentAt) return;
		readers.delete(userId);
		this.onChange(buddyReadId);
	}

	stopEverywhere(userId: string): void {
		for (const buddyReadId of this.reads.keys()) this.stop(buddyReadId, userId);
	}

	/** Drops readers silent past the idle limit. */
	tick(now: number): void {
		for (const [buddyReadId, readers] of this.reads) {
			let changed = false;
			for (const [userId, r] of readers) {
				if (now - r.lastSeenAt > LIVE_IDLE_MS) {
					readers.delete(userId);
					changed = true;
				}
			}
			if (readers.size === 0) this.reads.delete(buddyReadId);
			if (changed) this.onChange(buddyReadId);
		}
	}

	members(buddyReadId: string): LiveMember[] {
		return [...(this.reads.get(buddyReadId) ?? [])].map(([userId, r]) => {
			return {
				userId,
				wordPosition: r.position,
				wordCount: r.wordCount,
				isListening: r.mode === "listen",
				wpm:
					r.mode !== "listen" && r.activeMs >= LIVE_MIN_SITTING_MS
						? Math.round(r.credited / (r.activeMs / 60_000))
						: null,
			};
		});
	}

	readIds(): string[] {
		return [...this.reads.keys()];
	}
}
