import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import type { LiveMember } from "@lesefluss/core";
import { cn } from "@lesefluss/ui/utils";
import { useEffect, useState } from "react";
import { useBuddyReadProgress, useBuddyReads } from "../../services/social/buddy-reads";
import { useIsOnline } from "../../services/social/cache";

export type BuddyMarker = {
	userId: string;
	name: string;
	handle: string;
	avatarUrl: string | null;
	wordPosition: number;
	/** Along the viewer's own progress bar, 0 to 100. */
	percent: number;
	/** Set while they have the book open right now. */
	live: LiveMember | null;
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
	buddyReadId: string | null,
	ownWordCount: number,
	live: Map<string, LiveMember>,
): { markers: BuddyMarker[]; approximate: boolean } {
	const isForeground = useIsForeground();
	const isOnline = useIsOnline();
	const progress = useBuddyReadProgress(buddyReadId, isForeground && isOnline);
	if (!buddyReadId || ownWordCount <= 0) return { markers: [], approximate: false };
	const markers = (progress.data?.participants ?? []).map((p) => {
		const now = live.get(p.userId) ?? null;
		const wordPosition = now?.wordPosition ?? p.wordPosition;
		return {
			userId: p.userId,
			name: p.name,
			handle: p.handle,
			avatarUrl: p.avatarUrl,
			wordPosition,
			percent: Math.min(100, Math.max(0, (wordPosition / ownWordCount) * 100)),
			live: now,
		};
	});
	return { markers, approximate: progress.data?.approximate ?? false };
}

function relativeTo(theirs: number, mine: number): string {
	const delta = theirs - mine;
	if (Math.abs(delta) < 10) return "level with you";
	const words = `${Math.abs(delta).toLocaleString()} words`;
	return delta > 0 ? `${words} ahead` : `${words} behind`;
}

/**
 * The popover's second line. When copies' word counts differ the word gap is
 * unreliable, so it is left out, as on the buddy-read page.
 */
export function markerDetail(
	marker: Pick<BuddyMarker, "live" | "wordPosition">,
	myWord: number,
	approximate: boolean,
): string {
	const parts: string[] = [];
	if (marker.live) {
		parts.push(marker.live.wpm !== null ? `reading now · ${marker.live.wpm} wpm` : "reading now");
	}
	if (!approximate) parts.push(relativeTo(marker.wordPosition, myWord));
	return parts.join(" · ");
}

/**
 * Dots above the progress track. A marker swallows its own pointer events so
 * a tap shows who is there instead of scrubbing the reader to that spot.
 */
export function BuddyReadMarkers({
	markers,
	myWord,
	approximate,
	isCollapsed,
}: {
	markers: BuddyMarker[];
	myWord: number;
	approximate: boolean;
	/** The resting progress line: small dots, nothing to tap. */
	isCollapsed: boolean;
}) {
	const [openId, setOpenId] = useState<string | null>(null);
	useEffect(() => {
		if (!openId) return;
		const timer = setTimeout(() => setOpenId(null), 4000);
		return () => clearTimeout(timer);
	}, [openId]);
	if (markers.length === 0) return null;
	if (isCollapsed) {
		return (
			<div className="reader-buddy-markers" aria-hidden>
				{markers.map((m) => (
					<span
						key={m.userId}
						className={cn("reader-buddy-dot", m.live && "reader-buddy-dot--live")}
						style={{ left: `${m.percent}%` }}
					/>
				))}
			</div>
		);
	}
	const open = markers.find((m) => m.userId === openId) ?? null;
	const nearOpen = open ? markers.filter((m) => Math.abs(m.percent - open.percent) < 1.5) : [];
	const stop = (e: React.PointerEvent) => e.stopPropagation();
	return (
		<div className="reader-buddy-markers">
			{markers.map((m) => (
				<button
					key={m.userId}
					type="button"
					className={cn("reader-buddy-marker", m.live && "reader-buddy-marker--live")}
					style={{ left: `${m.percent}%` }}
					aria-label={`${m.name} is at ${Math.round(m.percent)}%${m.live ? ", reading now" : ""}`}
					onPointerDown={stop}
					onPointerMove={stop}
					onPointerUp={stop}
					onClick={(e) => {
						e.stopPropagation();
						setOpenId((current) => (current === m.userId ? null : m.userId));
					}}
				>
					{m.avatarUrl ? (
						<img src={m.avatarUrl} alt="" />
					) : (
						<span aria-hidden>{m.name.slice(0, 1).toUpperCase()}</span>
					)}
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
							<div>
								{m.name} <span className="reader-buddy-popover-handle">@{m.handle}</span> ·{" "}
								{Math.round(m.percent)}%
							</div>
							{markerDetail(m, myWord, approximate) && (
								<div className="reader-buddy-popover-handle">
									{m.live && <span className="reader-buddy-live-dot" />}{" "}
									{markerDetail(m, myWord, approximate)}
								</div>
							)}
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
