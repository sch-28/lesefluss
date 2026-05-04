/**
 * useReadingSession - log a single in-app reading sitting to `reading_sessions`.
 *
 * Owns one logical session per (book, mode) pair. Reads `getPosition` lazily
 * so it does not re-render when the offset moves.
 *
 * Lifecycle:
 *   1. Armed on mount; only commits a row if the user actually progresses past
 *      the noise floor (>= 5s of active time AND >= 5 words read).
 *   2. Pauses on `document.visibilitychange === "hidden"`; resumes on visible.
 *   3. 60s without position progress finalizes the row (idle detection, also
 *      catches RSVP pause since wordIndex stops advancing while paused).
 *   4. 5min heartbeat while active checkpoints (UPSERTs) the same row in place
 *      so a crash loses <= 5min. The sitting stays one row regardless of
 *      length, so aggregates like longestSessionMs reflect the true duration.
 *   5. bookId or mode change finalizes the prior session, opens a new one.
 *   6. Unmount finalizes.
 */

import { useEffect, useRef } from "react";
import { bookKeys, statsKeys } from "../../services/db/hooks/query-keys";
import { queries } from "../../services/db/queries";
import { queryClient } from "../../services/query-client";
import { scheduleSyncPush } from "../../services/sync";
import { log } from "../../utils/log";
import { randomHexId } from "../../utils/random-id";

const POLL_MS = 5_000;
const PAUSE_FLUSH_MS = 60_000;
const HEARTBEAT_MS = 5 * 60_000;
const MIN_DURATION_MS = 5_000;
const MIN_WORDS = 5;

export type ReadingSessionMode = "rsvp" | "scroll" | "page";

/**
 * Per-poll-tick byte distance above which we treat a position change as a
 * jump (TOC nav, scrub, scroll-to-find-spot) rather than reading. Words in
 * jumps are not counted toward `wordsAccumulated`. Mode-specific because
 * page-mode page-turns legitimately advance ~one page of bytes per turn.
 *  - scroll: ~1 phone screen, anything faster is a scroll burst, not reading
 *  - page:   3x scroll to allow page-turns through long pages
 *  - rsvp:   bounded by the engine; allow a wide window for scrub/TOC catches
 */
const JUMP_BYTES_PER_TICK: Record<ReadingSessionMode, number> = {
	scroll: 1000,
	page: 3000,
	rsvp: 2000,
};

/** Sanity ceiling for delivered WPM (scroll/page only). RSVP is bounded by
 *  the dial. Above this, a session's wpmAvg is stored as null. */
const SANE_WPM_CEILING = 800;

type Args = {
	bookId: string;
	mode: ReadingSessionMode;
	/** True when the user is actively reading (mode-on-screen). */
	isActive: boolean;
	/** Lazy reader for the current byte offset. Should be cheap and stable. */
	getPosition: () => number;
	/** Book content for words-read computation at flush. */
	content: string;
	/** Configured RSVP WPM at session start. Persisted as `wpmAvg` for RSVP
	 * sessions so stats reflect the dial setting, not the delivered rate
	 * (which is lower due to punctuation pauses + accel ramp). */
	wpmSetting?: number;
};

type SessionState = {
	/** Stable row id, generated once at session start. The 5min heartbeat
	 * checkpoints (upserts) the same id so a sitting maps to one row. */
	id: string;
	bookId: string;
	mode: ReadingSessionMode;
	/** Pre-encoded UTF-8 bytes of the book content. Encoded once at session
	 * start so per-tick word counts don't re-encode the whole book. */
	contentBytes: Uint8Array;
	getPosition: () => number;
	startedAt: number;
	startPos: number;
	lastPos: number;
	lastProgressAt: number;
	/** Wall-clock ms of the last successful checkpoint write. Used to throttle
	 * the heartbeat to one upsert per HEARTBEAT_MS of real time, since
	 * accumulators are no longer reset between checkpoints. */
	lastCheckpointAt: number;
	accumulatedActiveMs: number;
	/** Wall-clock ms when the current "active" period began. null = currently paused. */
	activeSinceMs: number | null;
	wpmSetting: number | null;
	/** Words counted from smooth (non-jump) position deltas across poll ticks.
	 * Source of truth for wordsRead at flush time, supersedes a raw
	 * startPos→endPos count which over-reports jumps. */
	wordsAccumulated: number;
};

/** Count whitespace-separated words in a UTF-8 byte range. Symmetric. */
function wordsInBytes(bytes: Uint8Array, a: number, b: number): number {
	const lo = Math.min(a, b);
	const hi = Math.max(a, b);
	if (hi <= lo) return 0;
	const slice = new TextDecoder().decode(bytes.slice(lo, hi));
	const matches = slice.match(/\S+/g);
	return matches ? matches.length : 0;
}

/** Build the row to persist, or null when the session is still below the noise
 * floor and shouldn't be written yet. Used by both checkpoint (in-place
 * heartbeat) and flush (terminal end-of-sitting). */
function buildRow(session: SessionState, now: number) {
	const finalActiveMs =
		session.accumulatedActiveMs +
		(session.activeSinceMs !== null ? now - session.activeSinceMs : 0);
	if (finalActiveMs < MIN_DURATION_MS) return null;
	const wordsRead = session.wordsAccumulated;
	if (wordsRead < MIN_WORDS) return null;
	const endPos = session.getPosition();
	// RSVP: store the dial setting (the engine's effective rate is lower due
	// to punctuation/accel; users want to see what they configured).
	// Scroll/page: store the delivered rate, capped at SANE_WPM_CEILING to
	// reject obvious miscounts (jumps that slipped through segmenting).
	const computedWpm =
		finalActiveMs > 1000 ? Math.round(wordsRead / (finalActiveMs / 60_000)) : null;
	const wasCapped =
		session.mode !== "rsvp" && computedWpm != null && computedWpm > SANE_WPM_CEILING;
	const wpmAvg =
		session.mode === "rsvp" ? (session.wpmSetting ?? null) : wasCapped ? null : computedWpm;
	return {
		id: session.id,
		bookId: session.bookId,
		mode: session.mode,
		startedAt: session.startedAt,
		endedAt: now,
		durationMs: finalActiveMs,
		wordsRead,
		startPos: session.startPos,
		endPos,
		wpmAvg,
		updatedAt: now,
	};
}

function persistRow(row: ReturnType<typeof buildRow>, label: string): void {
	if (!row) return;
	queries
		.upsertReadingSession(row)
		.then(() => {
			// Refresh anything that aggregates over reading_sessions: the global
			// stats page, the per-book card, and the library sort/progress data
			// (lastRead is bumped indirectly).
			queryClient.invalidateQueries({ queryKey: statsKeys.all });
			queryClient.invalidateQueries({ queryKey: bookKeys.all });
			scheduleSyncPush(2000);
		})
		.catch((err) => log.error("reading-session", `${label} failed:`, err));
}

/** In-place checkpoint: writes the current state of the sitting under the
 * stable session id and keeps the session running. Crash safety without
 * fragmenting a long sitting into many rows. */
function checkpoint(session: SessionState | null): void {
	if (!session) return;
	persistRow(buildRow(session, Date.now()), "checkpoint");
}

/** Terminal write at the natural end of a sitting. The caller is responsible
 * for clearing `sessionRef` after this returns. */
function flush(session: SessionState | null): void {
	if (!session) return;
	persistRow(buildRow(session, Date.now()), "flush");
}

function startSession(args: {
	bookId: string;
	mode: ReadingSessionMode;
	content: string;
	getPosition: () => number;
	wpmSetting: number | null;
}): SessionState {
	const now = Date.now();
	const pos = args.getPosition();
	return {
		id: randomHexId(),
		bookId: args.bookId,
		mode: args.mode,
		contentBytes: new TextEncoder().encode(args.content),
		getPosition: args.getPosition,
		startedAt: now,
		startPos: pos,
		lastPos: pos,
		lastProgressAt: now,
		lastCheckpointAt: now,
		accumulatedActiveMs: 0,
		activeSinceMs: now,
		wpmSetting: args.wpmSetting,
		wordsAccumulated: 0,
	};
}

export function useReadingSession({
	bookId,
	mode,
	isActive,
	getPosition,
	content,
	wpmSetting,
}: Args): void {
	const sessionRef = useRef<SessionState | null>(null);
	const isActiveRef = useRef(isActive);
	const argsRef = useRef({ bookId, mode, getPosition, content, wpmSetting });
	argsRef.current = { bookId, mode, getPosition, content, wpmSetting };

	useEffect(() => {
		// If the user toggles between modes (e.g. scroll → rsvp) while still
		// actively reading, the cleanup below flushes the prior session but
		// `isActive` doesn't change, so the [isActive] effect won't open a new
		// one. Open it here instead.
		if (isActiveRef.current && !sessionRef.current) {
			sessionRef.current = startSession({
				bookId,
				mode,
				content: argsRef.current.content,
				getPosition: argsRef.current.getPosition,
				wpmSetting: argsRef.current.wpmSetting ?? null,
			});
		}
		return () => {
			flush(sessionRef.current);
			sessionRef.current = null;
		};
	}, [bookId, mode]);

	useEffect(() => {
		isActiveRef.current = isActive;
		const now = Date.now();
		const s = sessionRef.current;
		if (isActive) {
			if (!s) {
				sessionRef.current = startSession({
					bookId: argsRef.current.bookId,
					mode: argsRef.current.mode,
					content: argsRef.current.content,
					getPosition: argsRef.current.getPosition,
					wpmSetting: argsRef.current.wpmSetting ?? null,
				});
			} else if (s.activeSinceMs === null) {
				s.activeSinceMs = now;
			}
		} else if (s && s.activeSinceMs !== null) {
			s.accumulatedActiveMs += now - s.activeSinceMs;
			s.activeSinceMs = null;
		}
	}, [isActive]);

	useEffect(() => {
		function onVisibility() {
			const s = sessionRef.current;
			if (!s) return;
			const now = Date.now();
			if (document.visibilityState === "hidden") {
				if (s.activeSinceMs !== null) {
					s.accumulatedActiveMs += now - s.activeSinceMs;
					s.activeSinceMs = null;
				}
			} else if (isActiveRef.current && s.activeSinceMs === null) {
				s.activeSinceMs = now;
			}
		}
		document.addEventListener("visibilitychange", onVisibility);
		return () => document.removeEventListener("visibilitychange", onVisibility);
	}, []);

	useEffect(() => {
		const interval = setInterval(() => {
			const s = sessionRef.current;
			if (!s) return;
			const now = Date.now();
			const pos = s.getPosition();
			if (pos !== s.lastPos) {
				const delta = Math.abs(pos - s.lastPos);
				const threshold = JUMP_BYTES_PER_TICK[s.mode];
				if (delta < threshold) {
					s.wordsAccumulated += wordsInBytes(s.contentBytes, s.lastPos, pos);
				}
				s.lastPos = pos;
				s.lastProgressAt = now;
			}
			if (s.activeSinceMs !== null && now - s.lastProgressAt > PAUSE_FLUSH_MS) {
				flush(s);
				sessionRef.current = null;
				return;
			}
			if (now - s.lastCheckpointAt > HEARTBEAT_MS) {
				checkpoint(s);
				s.lastCheckpointAt = now;
			}
		}, POLL_MS);
		return () => clearInterval(interval);
	}, []);
}
