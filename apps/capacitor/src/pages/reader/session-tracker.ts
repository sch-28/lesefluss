/**
 * SessionTracker: pure (no React, no DB) state machine for one reading
 * sitting. The hook in `use-reading-session.ts` subscribes lifecycle
 * signals (visibility, App state, isReading, RSVP isPlaying) and
 * persistence into this class.
 *
 * Positions are word indices.
 *
 * State machine:
 *   - no-session: idle, nothing accruing
 *   - active:     time accruing into accumulatedActiveMs
 *   - soft-paused: session alive, time frozen (activeSinceMs=null), resumes
 *                  on next activity signal or position progress
 *
 * Transitions:
 *   - shouldBeActive (reading && foreground) drives session open/resume
 *   - 3 min without activity while active → soft pause (keep session)
 *   - 10 min without activity → hard end (finalize row, clear session)
 *   - background returns after >10 min → finalize old, open new
 *   - background returns within 10 min → resume same session
 *   - poll gap > POLL_THROTTLE_GUARD_MS → assume timer was suspended;
 *     don't count gap as idle (resets activity clock to now)
 */
import { type WordPosition, wordPos } from "@lesefluss/core";
import { log } from "../../utils/log";
import { randomHexId } from "../../utils/random-id";

export type ReadingSessionMode = "rsvp" | "scroll" | "page";

export type SessionRow = {
	id: string;
	bookId: string;
	mode: ReadingSessionMode;
	startedAt: number;
	endedAt: number;
	durationMs: number;
	wordsRead: number;
	startWord: WordPosition;
	endWord: WordPosition;
	wpmAvg: number | null;
	updatedAt: number;
};

export type PersistKind = "checkpoint" | "flush";

export type TrackerOpts = {
	bookId: string;
	mode: ReadingSessionMode;
	/** Returns the current word position. */
	getPosition: () => number;
	wpmSetting: number | null;
	persist: (row: SessionRow, kind: PersistKind) => void;
	now?: () => number;
	newId?: () => string;
};

export const POLL_MS = 5_000;
/** Poll gap above this means the timer was throttled/suspended; treat as no
 *  info (don't count as idle, refresh position baseline). */
export const POLL_THROTTLE_GUARD_MS = 15_000;
export const SOFT_IDLE_MS = 3 * 60_000;
export const HARD_END_MS = 10 * 60_000;
export const HEARTBEAT_MS = 30_000;
export const MIN_DURATION_MS = 5_000;
export const MIN_WORDS = 5;

const SANE_WPM_CEILING = 800;

/** Per-poll-tick word distance above which we treat position movement as a
 *  jump (TOC nav, scrub) rather than reading. Mode-specific because page-mode
 *  page-turns advance roughly one page of words per turn. */
const JUMP_WORDS_PER_TICK: Record<ReadingSessionMode, number> = {
	scroll: 400, // ~2 screens of phone-font prose per 5s = fast scroll, not jump
	page: 1200, // ~5 default-font pages per 5s = power flipping, not jump
	rsvp: 800, // ~600 WPM cap × 5s = engine ceiling
};

type SessionState = {
	id: string;
	startedAt: number;
	startPos: number;
	lastPos: number;
	/** Highest word position reached this sitting (forward-progress only). */
	maxPos: number;
	accumulatedActiveMs: number;
	/** Wall-clock ms when current "active" interval began; null = paused. */
	activeSinceMs: number | null;
	lastCheckpointAt: number;
};

export class SessionTracker {
	private readonly opts: TrackerOpts;
	private foreground = true;
	private reading = false;
	private session: SessionState | null = null;
	private lastActivityAt: number;
	private lastPollAt: number;

	constructor(opts: TrackerOpts) {
		this.opts = opts;
		const now = this.now();
		this.lastActivityAt = now;
		this.lastPollAt = now;
	}

	private now(): number {
		return this.opts.now?.() ?? Date.now();
	}

	private newId(): string {
		return this.opts.newId?.() ?? randomHexId();
	}

	private get shouldBeActive(): boolean {
		return this.foreground && this.reading;
	}

	setForeground(value: boolean): void {
		if (this.foreground === value) return;
		this.foreground = value;
		this.reconcile();
	}

	setReading(value: boolean): void {
		if (this.reading === value) return;
		this.reading = value;
		this.reconcile();
	}

	markActivity(): void {
		if (!this.shouldBeActive) return;
		const now = this.now();
		this.lastActivityAt = now;
		if (!this.session) {
			this.openSession(now);
		} else if (this.session.activeSinceMs === null) {
			this.session.activeSinceMs = now;
		}
	}

	/** Periodic tick from setInterval (POLL_MS). */
	tick(): void {
		const now = this.now();
		const pollDelta = now - this.lastPollAt;
		this.lastPollAt = now;

		if (!this.session) return;
		if (!this.shouldBeActive) return;

		// Smooth forward deltas advance maxPos so re-reading the same range
		// doesn't double-count. Jumps still count as activity but don't
		// advance maxPos. Runs even on throttle-detected ticks because words
		// read between ticks are real even if the timer was suspended.
		const pos = this.opts.getPosition();
		if (pos !== this.session.lastPos) {
			const delta = Math.abs(pos - this.session.lastPos);
			const threshold = JUMP_WORDS_PER_TICK[this.opts.mode];
			if (delta < threshold && pos > this.session.maxPos) {
				this.session.maxPos = pos;
			}
			this.session.lastPos = pos;
			this.lastActivityAt = now;
			if (this.session.activeSinceMs === null) {
				this.session.activeSinceMs = now;
			}
		}

		// Timer was suspended (screen lock, background throttle). The gap is
		// "no info" — don't count it as active. Settle the active interval up
		// to last known activity and restart fresh from now.
		if (pollDelta > POLL_THROTTLE_GUARD_MS) {
			if (this.session.activeSinceMs !== null) {
				this.session.accumulatedActiveMs += Math.max(
					0,
					this.lastActivityAt - this.session.activeSinceMs,
				);
				this.session.activeSinceMs = now;
			} else {
				this.session.activeSinceMs = now;
			}
			this.lastActivityAt = now;
			return;
		}

		const idleMs = now - this.lastActivityAt;

		// Soft idle: stop accruing time. Cap the active interval at the last
		// known activity rather than now — the grace period between
		// `lastActivityAt` and `SOFT_IDLE_MS` is undecided, and if we hit this
		// branch the user wasn't actually reading during it.
		if (this.session.activeSinceMs !== null && idleMs > SOFT_IDLE_MS) {
			this.session.accumulatedActiveMs += Math.max(
				0,
				this.lastActivityAt - this.session.activeSinceMs,
			);
			this.session.activeSinceMs = null;
		}

		// Hard end: finalize this sitting. A new sitting opens on next activity.
		if (idleMs > HARD_END_MS) {
			this.finalize();
			return;
		}

		// Heartbeat checkpoint so a crash loses ≤HEARTBEAT_MS.
		if (now - this.session.lastCheckpointAt > HEARTBEAT_MS) {
			const row = this.buildRow(now);
			if (row) {
				this.opts.persist(row, "checkpoint");
				this.session.lastCheckpointAt = now;
			}
		}
	}

	/** Terminal write at the natural end of a sitting (unmount, book/mode
	 *  change). Drops below noise floor with an info log. */
	finalize(): void {
		if (!this.session) return;
		const now = this.now();
		if (this.session.activeSinceMs !== null) {
			this.session.accumulatedActiveMs += now - this.session.activeSinceMs;
			this.session.activeSinceMs = null;
		}
		const row = this.buildRow(now);
		if (row) {
			this.opts.persist(row, "flush");
		} else {
			// Noise floor is deliberate: brief tab-switches, accidental opens,
			// and < MIN_DURATION_MS skims would otherwise pollute stats. Promote
			// the drop to `warn` so the cause of a "missing" session is easy to
			// spot in the console without scanning routine info logs.
			log.warn(
				"reading-session",
				`dropped (noise floor): duration=${this.session.accumulatedActiveMs}ms words=${this.session.maxPos - this.session.startPos} (thresholds: ${MIN_DURATION_MS}ms / ${MIN_WORDS} words)`,
			);
		}
		this.session = null;
	}

	private reconcile(): void {
		const now = this.now();
		if (this.shouldBeActive) {
			if (this.session) {
				// Returning to active. If away longer than the hard cap, the prior
				// sitting is over — finalize it and start a new one.
				if (now - this.lastActivityAt > HARD_END_MS) {
					this.finalize();
					this.openSession(now);
					return;
				}
				if (this.session.activeSinceMs === null) {
					this.session.activeSinceMs = now;
					this.lastActivityAt = now;
				}
			} else {
				this.openSession(now);
			}
		} else if (this.session) {
			// Going inactive: settle the open active interval and checkpoint so
			// an app kill while backgrounded preserves the latest state.
			if (this.session.activeSinceMs !== null) {
				this.session.accumulatedActiveMs += now - this.session.activeSinceMs;
				this.session.activeSinceMs = null;
			}
			const row = this.buildRow(now);
			if (row) {
				this.opts.persist(row, "checkpoint");
				this.session.lastCheckpointAt = now;
			}
		}
	}

	private openSession(now: number): void {
		const pos = this.opts.getPosition();
		this.session = {
			id: this.newId(),
			startedAt: now,
			startPos: pos,
			lastPos: pos,
			maxPos: pos,
			accumulatedActiveMs: 0,
			activeSinceMs: now,
			lastCheckpointAt: now,
		};
		this.lastActivityAt = now;
		this.lastPollAt = now;
	}

	private buildRow(now: number): SessionRow | null {
		const s = this.session;
		if (!s) return null;
		const finalActiveMs =
			s.accumulatedActiveMs + (s.activeSinceMs !== null ? now - s.activeSinceMs : 0);
		if (finalActiveMs < MIN_DURATION_MS) return null;
		const wordsRead = Math.max(0, s.maxPos - s.startPos);
		if (wordsRead < MIN_WORDS) return null;
		const endPos = this.opts.getPosition();
		const computedWpm =
			finalActiveMs > 1000 ? Math.round(wordsRead / (finalActiveMs / 60_000)) : null;
		const wasCapped =
			this.opts.mode !== "rsvp" && computedWpm !== null && computedWpm > SANE_WPM_CEILING;
		const wpmAvg =
			this.opts.mode === "rsvp" ? (this.opts.wpmSetting ?? null) : wasCapped ? null : computedWpm;
		return {
			id: s.id,
			bookId: this.opts.bookId,
			mode: this.opts.mode,
			startedAt: s.startedAt,
			endedAt: now,
			durationMs: finalActiveMs,
			wordsRead,
			startWord: wordPos(s.startPos),
			endWord: wordPos(endPos),
			wpmAvg,
			updatedAt: now,
		};
	}

	/** Test-only inspection of internal state. */
	_inspect() {
		return {
			hasSession: this.session !== null,
			sessionId: this.session?.id ?? null,
			activeSinceMs: this.session?.activeSinceMs ?? null,
			accumulatedActiveMs: this.session?.accumulatedActiveMs ?? 0,
			wordsAccumulated: this.session ? Math.max(0, this.session.maxPos - this.session.startPos) : 0,
			foreground: this.foreground,
			reading: this.reading,
			lastActivityAt: this.lastActivityAt,
		};
	}

	/** Snapshot for the on-screen debug badge. Computes the *currently
	 *  accruing* duration (includes the open active interval) so the badge
	 *  ticks visibly while the user reads. */
	getDebugSnapshot(): DebugSnapshot {
		const now = this.now();
		const s = this.session;
		if (!s) {
			return {
				hasSession: false,
				durationMs: 0,
				wordsAccumulated: 0,
				paused: true,
				foreground: this.foreground,
				reading: this.reading,
				msSinceLastActivity: now - this.lastActivityAt,
			};
		}
		const durationMs =
			s.accumulatedActiveMs + (s.activeSinceMs !== null ? now - s.activeSinceMs : 0);
		return {
			hasSession: true,
			durationMs,
			wordsAccumulated: Math.max(0, s.maxPos - s.startPos),
			paused: s.activeSinceMs === null,
			foreground: this.foreground,
			reading: this.reading,
			msSinceLastActivity: now - this.lastActivityAt,
		};
	}
}

export type DebugSnapshot = {
	hasSession: boolean;
	durationMs: number;
	wordsAccumulated: number;
	paused: boolean;
	foreground: boolean;
	reading: boolean;
	msSinceLastActivity: number;
};
