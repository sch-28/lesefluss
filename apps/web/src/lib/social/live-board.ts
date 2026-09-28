import {
	LIVE_IDLE_MS,
	LIVE_MIN_SITTING_MS,
	type LiveMember,
	type LiveReport,
	refillCredit,
	spendCredit,
} from "@lesefluss/core";

/**
 * Refill is capped per report so a reader who pauses and then jumps ahead
 * cannot bank a whole idle window of credit.
 */
const MAX_REFILL_MS = 10_000;

type Reader = {
	position: number;
	wordCount: number;
	lastSeenAt: number;
	sittingStartedAt: number;
	credited: number;
	budget: number;
};

/**
 * Who is reading which buddy read right now, in memory only. Speed is the
 * words credited in the current sitting over its duration, credited with the
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
		if (!prev || now - prev.lastSeenAt > LIVE_IDLE_MS) {
			readers.set(userId, {
				position: report.position,
				wordCount,
				lastSeenAt: now,
				sittingStartedAt: now,
				credited: 0,
				budget: 0,
			});
		} else {
			const elapsed = Math.min(now - prev.lastSeenAt, MAX_REFILL_MS);
			const refilled = refillCredit(prev.budget, report.mode, report.dialWpm, elapsed);
			const spent = spendCredit(refilled, prev.position, report.position);
			readers.set(userId, {
				...prev,
				position: report.position,
				wordCount,
				lastSeenAt: now,
				credited: prev.credited + spent.credited,
				budget: spent.budget,
			});
		}
		this.onChange(buddyReadId);
	}

	stop(buddyReadId: string, userId: string): void {
		if (this.reads.get(buddyReadId)?.delete(userId)) this.onChange(buddyReadId);
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

	members(buddyReadId: string, now: number): LiveMember[] {
		return [...(this.reads.get(buddyReadId) ?? [])].map(([userId, r]) => {
			const sittingMs = now - r.sittingStartedAt;
			return {
				userId,
				wordPosition: r.position,
				wordCount: r.wordCount,
				wpm:
					sittingMs >= LIVE_MIN_SITTING_MS ? Math.round(r.credited / (sittingMs / 60_000)) : null,
			};
		});
	}

	readIds(): string[] {
		return [...this.reads.keys()];
	}
}
