/**
 * useReadingSession — thin wrapper around `SessionTracker` that subscribes
 * lifecycle signals (visibility, App state, isReading, RSVP isPlaying) and
 * persistence side-effects. All state-machine logic lives in
 * `session-tracker.ts` (pure, testable).
 *
 * One logical sitting per (bookId, mode). On bookId/mode change the prior
 * tracker is finalized and a new one is constructed. Activity signals from
 * the reader views feed `markActivity` so we don't depend on position polling
 * alone — long-paragraph reading no longer triggers spurious idle flush.
 */
import { App as CapacitorApp } from "@capacitor/app";
import { useCallback, useEffect, useRef } from "react";
import { readingSessionKeys, statsKeys } from "../../services/db/hooks/query-keys";
import { queries } from "../../services/db/queries";
import { queryClient } from "../../services/query-client";
import { scheduleSyncPush } from "../../services/sync";
import { log } from "../../utils/log";
import { publishSessionPersist } from "../../test-hooks/reader";
import {
	type DebugSnapshot,
	POLL_MS,
	type ReadingSessionMode,
	type SessionRow,
	SessionTracker,
} from "./session-tracker";

export type { DebugSnapshot, ReadingSessionMode } from "./session-tracker";

type Args = {
	bookId: string;
	mode: ReadingSessionMode;
	/** Reader mounted with content loaded. Coarse-grained "the user is
	 *  on this reader page" signal; finer-grained pause/resume is handled by
	 *  visibility/App state and RSVP isPlaying. */
	isReading: boolean;
	/** When mode === 'rsvp', true while the engine is playing. Passing false
	 *  pauses the session immediately rather than waiting for soft idle. */
	rsvpIsPlaying?: boolean;
	/** Returns the current word position. */
	getPosition: () => number;
	/** RSVP dial setting (persisted as wpmAvg for RSVP sessions). */
	wpmSetting?: number;
};

type Return = {
	/** Reader views call this on any user interaction (scroll, page turn,
	 *  RSVP word advance, tap). Keeps the session alive past the soft idle
	 *  threshold without depending on position deltas. */
	markActivity: () => void;
	/** Snapshot reader for the on-screen debug badge. Returns null when no
	 *  tracker is mounted (book hasn't loaded yet). */
	getDebugSnapshot: () => DebugSnapshot | null;
};

function persistRow(row: SessionRow, kind: "checkpoint" | "flush"): void {
	queries
		.upsertReadingSession(row)
		.then(() => {
			// Heartbeat checkpoints fire every 30s while reading. The write
			// only touches `reading_sessions`, so book queries don't need to
			// refetch. Stats + session queries feed the stats/library screens
			// (not the reader) and can wait for the sitting-end flush.
			if (kind === "flush") {
				queryClient.invalidateQueries({ queryKey: statsKeys.all });
				queryClient.invalidateQueries({ queryKey: readingSessionKeys.all });
				scheduleSyncPush(2000);
			}
			if (import.meta.env.DEV) publishSessionPersist(row.bookId, kind);
		})
		.catch((err) => log.error("reading-session", `${kind} failed:`, err));
}

export function useReadingSession({
	bookId,
	mode,
	isReading,
	rsvpIsPlaying,
	getPosition,
	wpmSetting,
}: Args): Return {
	const trackerRef = useRef<SessionTracker | null>(null);
	const getPositionRef = useRef(getPosition);
	getPositionRef.current = getPosition;
	const wpmRef = useRef(wpmSetting);
	wpmRef.current = wpmSetting;

	// Construct a tracker per (bookId, mode). Prior tracker is finalized so
	// the row for the previous sitting is written before we open a new one.
	// `wpmSetting` is read via a ref so dial changes inside a sitting don't
	// tear down the session.
	useEffect(() => {
		trackerRef.current?.finalize();
		trackerRef.current = new SessionTracker({
			bookId,
			mode,
			getPosition: () => getPositionRef.current(),
			wpmSetting: wpmRef.current ?? null,
			persist: persistRow,
		});
		return () => {
			trackerRef.current?.finalize();
			trackerRef.current = null;
		};
	}, [bookId, mode]);

	// `isReading` && (RSVP not paused) → reading.
	useEffect(() => {
		const reading = isReading && (mode !== "rsvp" || rsvpIsPlaying !== false);
		trackerRef.current?.setReading(reading);
	}, [isReading, rsvpIsPlaying, mode]);

	// Lifecycle union: document visibility AND Capacitor App active.
	useEffect(() => {
		let docVisible = document.visibilityState !== "hidden";
		let appActive = true;
		const apply = () => trackerRef.current?.setForeground(docVisible && appActive);
		apply();

		const onVis = () => {
			docVisible = document.visibilityState !== "hidden";
			apply();
		};
		document.addEventListener("visibilitychange", onVis);

		const appListenerPromise = CapacitorApp.addListener("appStateChange", ({ isActive }) => {
			appActive = isActive;
			apply();
		});

		return () => {
			document.removeEventListener("visibilitychange", onVis);
			void appListenerPromise
				.then((handle) => handle.remove())
				.catch((err) => log.error("reading-session", "appStateChange cleanup failed:", err));
		};
	}, []);

	// Periodic tick. Wall-clock-guarded against suspension inside the tracker.
	useEffect(() => {
		const interval = setInterval(() => trackerRef.current?.tick(), POLL_MS);
		return () => clearInterval(interval);
	}, []);

	const markActivity = useCallback(() => {
		trackerRef.current?.markActivity();
	}, []);

	const getDebugSnapshot = useCallback(() => {
		return trackerRef.current?.getDebugSnapshot() ?? null;
	}, []);

	return { markActivity, getDebugSnapshot };
}
