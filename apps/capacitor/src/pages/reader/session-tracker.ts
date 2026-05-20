/**
 * SessionTracker — pure (no React, no DB) state machine for one reading
 * sitting. The hook in `use-reading-session.ts` is a thin wrapper that
 * subscribes lifecycle signals (visibility, App state, isReading, RSVP
 * isPlaying) and persistence into this class.
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
	startPos: number;
	endPos: number;
	/** Canonical word-unit bounds (ADR-0002). Populated when a WordIndex is wired. */
	startWord?: number;
	endWord?: number;
	wpmAvg: number | null;
	updatedAt: number;
};

export type PersistKind = "checkpoint" | "flush";

export type TrackerOpts = {
	bookId: string;
	mode: ReadingSessionMode;
	content: string;
	getPosition: () => number;
	wpmSetting: number | null;
	persist: (row: SessionRow, kind: PersistKind) => void;
	now?: () => number;
	newId?: () => string;
	/**
	 * Optional byte→word converter. Returns null when the WordIndex isn't
	 * available yet (book still loading). When non-null on both endpoints,
	 * SessionRow gains startWord/endWord.
	 */
	byteToWord?: (byteOffset: number) => number | null;
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

/** Per-poll-tick byte distance above which we treat position movement as a
 *  jump (TOC nav, scrub) rather than reading. Mode-specific because page-mode
 *  page-turns advance ~one page of bytes per turn. */
const JUMP_BYTES_PER_TICK: Record<ReadingSessionMode, number> = {
	scroll: 1000,
	page: 3000,
	rsvp: 2000,
};

function wordsInBytes(bytes: Uint8Array, a: number, b: number): number {
	const lo = Math.min(a, b);
	const hi = Math.max(a, b);
	if (hi <= lo) return 0;
	const slice = new TextDecoder().decode(bytes.slice(lo, hi));
	const matches = slice.match(/\S+/g);
	return matches ? matches.length : 0;
}

type SessionState = {
	id: string;
	startedAt: number;
	startPos: number;
	lastPos: number;
	accumulatedActiveMs: number;
	/** Wall-clock ms when current "active" interval began; null = paused. */
	activeSinceMs: number | null;
	wordsAccumulated: number;
	lastCheckpointAt: number;
};

export class SessionTracker {
	private readonly opts: TrackerOpts;
	/** Pre-encoded UTF-8 bytes of the current content. Mutable: refreshed via
	 *  `setContent` when the book content loads (it may be empty at tracker
	 *  construction) or on chapter advance within a sitting. */
	private contentBytes: Uint8Array;
	private foreground = true;
	private reading = false;
	private session: SessionState | null = null;
	private lastActivityAt: number;
	private lastPollAt: number;

	constructor(opts: TrackerOpts) {
		this.opts = opts;
		this.contentBytes = new TextEncoder().encode(opts.content);
		const now = this.now();
		this.lastActivityAt = now;
		this.lastPollAt = now;
	}

	setContent(content: string): void {
		this.contentBytes = new TextEncoder().encode(content);
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

		// Position polling first: catches scroll/page progress that wasn't
		// reported via markActivity. Smooth deltas accumulate words; jumps
		// reset the baseline but still count as activity. Runs even on a
		// throttle-detected tick — bytes-read between ticks are real even if
		// the timer was suspended.
		const pos = this.opts.getPosition();
		if (pos !== this.session.lastPos) {
			const delta = Math.abs(pos - this.session.lastPos);
			const threshold = JUMP_BYTES_PER_TICK[this.opts.mode];
			if (delta < threshold) {
				this.session.wordsAccumulated += wordsInBytes(this.contentBytes, this.session.lastPos, pos);
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
			log(
				"reading-session",
				`dropped (below noise floor): duration=${this.session.accumulatedActiveMs}ms words=${this.session.wordsAccumulated}`,
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
			accumulatedActiveMs: 0,
			activeSinceMs: now,
			wordsAccumulated: 0,
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
		if (s.wordsAccumulated < MIN_WORDS) return null;
		const endPos = this.opts.getPosition();
		const computedWpm =
			finalActiveMs > 1000 ? Math.round(s.wordsAccumulated / (finalActiveMs / 60_000)) : null;
		const wasCapped =
			this.opts.mode !== "rsvp" && computedWpm !== null && computedWpm > SANE_WPM_CEILING;
		const wpmAvg =
			this.opts.mode === "rsvp" ? (this.opts.wpmSetting ?? null) : wasCapped ? null : computedWpm;
		const sw = this.opts.byteToWord?.(s.startPos);
		const ew = this.opts.byteToWord?.(endPos);
		const wordCols =
			sw !== undefined && sw !== null && ew !== undefined && ew !== null
				? { startWord: sw, endWord: ew }
				: {};
		return {
			id: s.id,
			bookId: this.opts.bookId,
			mode: this.opts.mode,
			startedAt: s.startedAt,
			endedAt: now,
			durationMs: finalActiveMs,
			wordsRead: s.wordsAccumulated,
			startPos: s.startPos,
			endPos,
			...wordCols,
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
			wordsAccumulated: this.session?.wordsAccumulated ?? 0,
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
			wordsAccumulated: s.wordsAccumulated,
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
