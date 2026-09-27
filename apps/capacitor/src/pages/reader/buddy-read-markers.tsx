import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useEffect, useState } from "react";
import { useBuddyReadProgress, useBuddyReads } from "../../services/social/buddy-reads";
import { useIsOnline } from "../../services/social/cache";

export type BuddyMarker = {
	userId: string;
	name: string;
	handle: string;
	/** Along the viewer's own progress bar, 0 to 100. */
	percent: number;
};

/** Foreground as either platform reports it: the web build has no app state, native WebViews may keep "visible". */
export function useIsForeground(): boolean {
	const [isForeground, setIsForeground] = useState(() => document.visibilityState === "visible");
	useEffect(() => {
		const onVisibility = () => setIsForeground(document.visibilityState === "visible");
		document.addEventListener("visibilitychange", onVisibility);
		const handle = Capacitor.isNativePlatform()
			? CapacitorApp.addListener("appStateChange", ({ isActive }) => setIsForeground(isActive))
			: null;
		return () => {
			document.removeEventListener("visibilitychange", onVisibility);
			handle?.then((h) => h.remove());
		};
	}, []);
	return isForeground;
}

/** The buddy read this book is in right now, if any; finished reads keep their discussion too. */
export function useRunningBuddyRead(originKey: string | null, isLoggedIn: boolean) {
	const reads = useBuddyReads(isLoggedIn && originKey !== null);
	const matching = (reads.data ?? []).filter((r) => r.originKey === originKey);
	return matching.find((r) => r.status === "in_progress") ?? matching[0] ?? null;
}

/**
 * Where the other members of this book's running buddy read are. Positions
 * are placed against the viewer's own word count: every member reads the same
 * content, so the same word index means the same place.
 */
export function useBuddyReadMarkers(
	originKey: string | null,
	ownWordCount: number,
	isLoggedIn: boolean,
): BuddyMarker[] {
	const isForeground = useIsForeground();
	const isOnline = useIsOnline();
	const found = useRunningBuddyRead(originKey, isLoggedIn);
	const read = found?.status === "in_progress" ? found : null;
	const progress = useBuddyReadProgress(read?.id ?? null, isForeground && isOnline);
	if (!read || ownWordCount <= 0) return [];
	return (progress.data?.participants ?? []).map((p) => ({
		userId: p.userId,
		name: p.name,
		handle: p.handle,
		percent: Math.min(100, Math.max(0, (p.wordPosition / ownWordCount) * 100)),
	}));
}

/**
 * Dots above the progress track. A marker swallows its own pointer events so
 * a tap shows who is there instead of scrubbing the reader to that spot.
 */
export function BuddyReadMarkers({ markers }: { markers: BuddyMarker[] }) {
	const [openId, setOpenId] = useState<string | null>(null);
	useEffect(() => {
		if (!openId) return;
		const timer = setTimeout(() => setOpenId(null), 4000);
		return () => clearTimeout(timer);
	}, [openId]);
	if (markers.length === 0) return null;
	const open = markers.find((m) => m.userId === openId) ?? null;
	const nearOpen = open ? markers.filter((m) => Math.abs(m.percent - open.percent) < 1.5) : [];
	const stop = (e: React.PointerEvent) => e.stopPropagation();
	return (
		<div className="reader-buddy-markers">
			{markers.map((m) => (
				<button
					key={m.userId}
					type="button"
					className="reader-buddy-marker"
					style={{ left: `${m.percent}%` }}
					aria-label={`${m.name} is at ${Math.round(m.percent)}%`}
					onPointerDown={stop}
					onPointerMove={stop}
					onPointerUp={stop}
					onClick={(e) => {
						e.stopPropagation();
						setOpenId((current) => (current === m.userId ? null : m.userId));
					}}
				>
					<span aria-hidden>{m.name.slice(0, 1).toUpperCase()}</span>
				</button>
			))}
			{open && (
				<div
					className="reader-buddy-popover"
					style={{ left: `clamp(60px, ${open.percent}%, calc(100% - 60px))` }}
					role="status"
				>
					{nearOpen.map((m) => (
						<div key={m.userId}>
							{m.name} <span className="reader-buddy-popover-handle">@{m.handle}</span> ·{" "}
							{Math.round(m.percent)}%
						</div>
					))}
				</div>
			)}
		</div>
	);
}

export type DiscussionTick = { key: string; percent: number; count: number; onTap: () => void };

/** Where unlocked comments and shared highlights sit, as ticks under the progress track. */
export function DiscussionTicks({ ticks }: { ticks: DiscussionTick[] }) {
	if (ticks.length === 0) return null;
	const stop = (e: React.PointerEvent) => e.stopPropagation();
	return (
		<div className="reader-discussion-ticks">
			{ticks.map((t) => (
				<button
					key={t.key}
					type="button"
					className="reader-discussion-tick"
					style={{ left: `${t.percent}%` }}
					aria-label={t.count === 1 ? "1 comment here" : `${t.count} comments here`}
					onPointerDown={stop}
					onPointerMove={stop}
					onPointerUp={stop}
					onClick={(e) => {
						e.stopPropagation();
						t.onTap();
					}}
				/>
			))}
		</div>
	);
}
