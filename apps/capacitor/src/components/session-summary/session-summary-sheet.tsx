import { DEFAULT_SETTINGS } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerTitle,
	drawerSnapPoints,
} from "@lesefluss/ui/drawer";
import { Link } from "@tanstack/react-router";
import { EyeOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { queryHooks } from "../../services/db/hooks";
import {
	dismissSummary,
	type SessionSummary,
	useSessionSummary,
} from "../../services/reading-sessions/summary-store";
import { summarize, todayMinutes } from "../../services/stats/session-summary";
import { startOfLocalDay } from "../../utils/date-utils";
import BookCover from "../book-cover";
import { BookTile, SpeedTile, TimeSavedTile, TimeTile, WordsTile } from "./summary-tiles";

const SNAP_POINTS = drawerSnapPoints([0.62, 1]);
const DAY_MS = 86_400_000;

function SummaryBody({ summary, onClose }: { summary: SessionSummary; onClose: () => void }) {
	const { data: book } = queryHooks.useBook(summary.bookId);
	const sittingIds = useMemo(() => summary.sittings.map((s) => s.id), [summary]);
	const { data: model } = queryHooks.useStatsSpeedModelWithout(sittingIds);
	const { data: settings } = queryHooks.useSettings();
	const { mutate: saveSettings } = queryHooks.useSaveSettings();
	const [now] = useState(() => Date.now());
	const dayStart = startOfLocalDay(now);
	const { data: today } = queryHooks.useStatsPeriodTotals(dayStart, dayStart + DAY_MS);
	const { data: goal } = queryHooks.useReadingGoalPlan(summary.bookId);
	const stats = summarize(summary.sittings, book?.wordCount ?? 0, model);
	const { data: trend } = queryHooks.useStatsWpmTrend(
		settings?.speedWindow ?? DEFAULT_SETTINGS.SPEED_WINDOW,
		stats.isRsvp ? "rsvp" : "reading",
		now,
	);

	const plan = goal?.plan.kind === "plan" ? goal.plan : null;
	const goalMinutes = plan?.dailyMinutes ?? null;
	// A minute goal judges this book's day, so its bar counts this book's minutes.
	const todayMs =
		plan && goalMinutes !== null
			? plan.progressToday.minutes * 60_000
			: (today?.minutes ?? 0) * 60_000;
	const minutes = todayMinutes(todayMs, stats.activeMs);
	const startedAt = summary.sittings[0]?.startedAt ?? now;
	const startTime = new Date(startedAt).toLocaleTimeString(undefined, {
		hour: "numeric",
		minute: "2-digit",
	});

	return (
		<>
			<div className="flex items-start gap-3 px-5 pt-2 pb-3">
				<div className="h-[60px] w-10 shrink-0">
					{book && <BookCover book={book} size="full" />}
				</div>
				<div className="min-w-0 flex-1">
					<DrawerTitle className="truncate">{book?.title ?? "Session"}</DrawerTitle>
					<DrawerDescription className="text-xs">
						{stats.isRsvp ? "RSVP session" : "Session"} · {startTime}
					</DrawerDescription>
				</div>
				<button
					type="button"
					onClick={() => {
						saveSettings({ showSessionSummary: false });
						onClose();
					}}
					className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-muted-foreground text-xs hover:bg-muted"
				>
					<EyeOff className="size-3.5" />
					Don't show again
				</button>
			</div>

			<div className="grid grid-cols-2 gap-2 overflow-y-auto px-4" data-testid="session-summary">
				<TimeTile
					activeMs={stats.activeMs}
					earlierMinutes={minutes.earlier}
					todayMinutes={minutes.total}
					goalMinutes={goalMinutes}
				/>
				<WordsTile words={stats.words} />
				<SpeedTile
					stats={stats}
					trend={(trend?.measured ?? []).filter((b) => b.avgWpm > 0).map((b) => b.avgWpm)}
				/>
				{stats.fromPercent !== null && stats.toPercent !== null && (
					<BookTile from={stats.fromPercent} to={stats.toPercent} />
				)}
				{stats.rsvp && <TimeSavedTile rsvp={stats.rsvp} />}
			</div>

			<DrawerFooter className="flex-row">
				<Button variant="outline" className="h-11 flex-1" asChild>
					<Link to="/tabs/library/stats" search={{ tab: "speed" }} onClick={onClose}>
						Speed tab
					</Link>
				</Button>
				<Button className="h-11 flex-1" onClick={onClose}>
					Done
				</Button>
			</DrawerFooter>
		</>
	);
}

/** Mounted once at the root, so it opens over whatever screen the reader closed to. */
export function SessionSummarySheet() {
	const summary = useSessionSummary();
	const { data: settings } = queryHooks.useSettings();
	const isOff = settings?.showSessionSummary === false;
	const [snap, setSnap] = useState<number | string | null>(SNAP_POINTS[0]);
	// Kept through the close animation, after the store has let it go.
	const shownRef = useRef<SessionSummary | null>(null);
	if (summary) shownRef.current = summary;
	const shown = shownRef.current;

	useEffect(() => {
		if (summary && isOff) dismissSummary();
	}, [summary, isOff]);

	useEffect(() => {
		if (summary) setSnap(SNAP_POINTS[0]);
	}, [summary]);

	const isOpen = summary !== null && settings !== undefined && !isOff;
	return (
		<Drawer
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) dismissSummary();
			}}
			snapPoints={SNAP_POINTS}
			activeSnapPoint={snap}
			setActiveSnapPoint={setSnap}
		>
			<DrawerContent>
				{shown && (
					<SummaryBody key={shown.sittings[0]?.id} summary={shown} onClose={dismissSummary} />
				)}
			</DrawerContent>
		</Drawer>
	);
}
