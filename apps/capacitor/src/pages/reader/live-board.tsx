import { LIVE_REPORT_INTERVAL_MS, type LiveMember } from "@lesefluss/core";
import { useEffect, useRef } from "react";
import { liveClient, useLiveBoard } from "@/services/social/live";
import { useOwnSocialProfile } from "@/services/social/profile";

type Options = {
	buddyReadId: string | null;
	/** Null until the reader has restored where the user left off. */
	getPosition: () => number | null;
	mode: "rsvp" | "scroll" | "page";
	dialWpm: number | null;
	isForeground: boolean;
	isOnline: boolean;
};

/**
 * Shares this reader's position with the buddy read while it is open, in the
 * foreground, online and opted in, and returns who else is reading right now.
 * Empty whenever the user does not share live activity.
 */
export function useLiveReading({
	buddyReadId,
	getPosition,
	mode,
	dialWpm,
	isForeground,
	isOnline,
}: Options): Map<string, LiveMember> {
	const isActive = buddyReadId !== null && isForeground && isOnline;
	const profile = useOwnSocialProfile(isActive);
	const sharesLive = isActive && profile.data?.shareLiveReading === true;
	const snapshot = useLiveBoard(buddyReadId, sharesLive);
	const latest = useRef({ getPosition, mode, dialWpm });
	latest.current = { getPosition, mode, dialWpm };

	useEffect(() => {
		if (!sharesLive || !buddyReadId) return;
		// One report in flight at a time: a slow one landing after a newer one
		// would put the reader back at the older position for everyone else.
		let pending: Promise<void> | null = null;
		const report = () => {
			const { getPosition: pos, mode: m, dialWpm: dial } = latest.current;
			const position = pos();
			if (position === null || pending) return;
			pending = liveClient
				.report(buddyReadId, position, m, m === "rsvp" ? dial : null)
				.catch(() => {})
				.finally(() => {
					pending = null;
				});
		};
		report();
		const t = setInterval(report, LIVE_REPORT_INTERVAL_MS);
		return () => {
			clearInterval(t);
			// After any report still in flight, or that report would mark them reading again.
			void (pending ?? Promise.resolve()).then(() => liveClient.stop(buddyReadId)).catch(() => {});
		};
	}, [sharesLive, buddyReadId]);

	return new Map((snapshot?.members ?? []).map((m) => [m.userId, m]));
}
