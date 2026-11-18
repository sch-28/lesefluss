import { DEFAULT_SETTINGS, milestonesReachedBetween } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerTitle,
} from "@lesefluss/ui/drawer";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@lesefluss/ui/dropdown-menu";
import { cn } from "@lesefluss/ui/utils";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { MoreHorizontal, Share2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { STAT_CAPTION } from "@/components/stat-tile";
import { queryHooks } from "../../services/db/hooks";
import {
	dismissSummary,
	type SessionSummary,
	useSessionSummary,
} from "../../services/reading-sessions/summary-store";
import { sessionCardData } from "../../services/share-card/card-data";
import type { ShareCardData } from "../../services/share-card/render";
import { summarize, todayMinutes } from "../../services/stats/session-summary";
import { formatClock, startOfLocalDay } from "../../utils/date-utils";
import BookCover from "../book-cover";
import { MedalGrid } from "../milestones/milestone-medals";
import { ShareCardSheet } from "../share-card/share-card-sheet";
import { BookTile, GoalRow, SpeedTile, TimeSavedTile, TimeTile, WordsTile } from "./summary-tiles";

const DAY_MS = 86_400_000;

const isReaderPath = (pathname: string) => pathname.startsWith("/tabs/reader/");

type SummaryProps = {
	summary: SessionSummary;
	isOpen: boolean;
	landedOn: string | null;
	onClose: () => void;
};

/** Opens only once every query it shows has settled, so no tile changes after the first frame. */
function SummaryDrawer({ summary, isOpen, landedOn, onClose }: SummaryProps) {
	const navigate = useNavigate();
	const book = queryHooks.useBook(summary.bookId);
	const sittingIds = useMemo(() => summary.sittings.map((s) => s.id), [summary]);
	const model = queryHooks.useStatsSpeedModelWithout(sittingIds);
	const { data: settings } = queryHooks.useSettings();
	const { mutate: saveSettings } = queryHooks.useSaveSettings();
	const [now] = useState(() => Date.now());
	const dayStart = startOfLocalDay(now);
	const today = queryHooks.useStatsPeriodTotals(dayStart, dayStart + DAY_MS);
	const goal = queryHooks.useReadingGoalPlan(summary.bookId);
	const milestones = queryHooks.useStatsMilestones();
	const { data: library } = queryHooks.useBooks();
	const [card, setCard] = useState<ShareCardData | null>(null);
	const stats = summarize(summary.sittings, book.data?.wordCount ?? 0, model.data);
	const trend = queryHooks.useStatsWpmTrend(
		settings?.speedWindow ?? DEFAULT_SETTINGS.SPEED_WINDOW,
		stats.isRsvp ? "rsvp" : "reading",
		now,
	);
	// isFetching too: the sitting's flush invalidates stats, so a warm cache entry is stale
	// but not pending. The book's own refetch is left out: a position save never changes
	// its title or cover. Latched, so a later refetch never closes the open sheet.
	const isSettled =
		!book.isPending &&
		![model, today, goal, milestones, trend].some((q) => q.isPending || q.isFetching);
	// The summary is about leaving the book, so once the user has moved on from the screen
	// the reader closed to, it would land on a screen it has nothing to do with.
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const [closedTo, setClosedTo] = useState(landedOn);
	if (closedTo === null && !isReaderPath(pathname)) setClosedTo(pathname);
	const isLeft = closedTo !== null && pathname !== closedTo;
	const canOpen = isSettled && closedTo !== null && !isLeft;
	const [isReady, setIsReady] = useState(canOpen);
	if (canOpen && !isReady) setIsReady(true);
	useEffect(() => {
		if (isLeft && !isReady) onClose();
	}, [isLeft, isReady, onClose]);

	const plan =
		goal.data?.plan.kind === "plan" && !goal.data.plan.isComplete ? goal.data.plan : null;
	const minutes = todayMinutes((today.data?.minutes ?? 0) * 60_000, stats.activeMs);
	const startedAt = summary.sittings[0]?.startedAt ?? now;
	const earned = milestones.data
		? milestonesReachedBetween(milestones.data, startedAt, now + 1)
		: [];
	const openCard = () => {
		if (!book.data) return;
		setCard(
			sessionCardData({
				book: {
					title: book.data.title,
					author: book.data.author,
					coverImage: library?.covers.get(book.data.id) ?? null,
				},
				stats,
				startedAt,
				milestones: earned,
			}),
		);
	};
	const startTime = formatClock(startedAt);

	return (
		// No snap points: vaul places snaps as if the sheet filled the screen, so any
		// snap below 1 on this content-height sheet pushes its tiles and Done off screen.
		<Drawer
			open={isOpen && isReady}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DrawerContent>
				<div className="flex items-start gap-3 px-5 pt-2 pb-3">
					<div className="h-[60px] w-10 shrink-0">
						{book.data && <BookCover book={book.data} size="full" />}
					</div>
					<div className="min-w-0 flex-1">
						<DrawerTitle className="truncate">{book.data?.title ?? "Session"}</DrawerTitle>
						<DrawerDescription className="text-xs">
							{stats.isRsvp ? "RSVP session" : "Session"} · {startTime}
						</DrawerDescription>
					</div>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon" aria-label="More" className="shrink-0">
								<MoreHorizontal />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem
								onSelect={() => {
									saveSettings({ showSessionSummary: false });
									onClose();
								}}
							>
								Don't show again
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>

				<div className="grid grid-cols-2 gap-2 overflow-y-auto px-4" data-testid="session-summary">
					{plan && <GoalRow plan={plan} />}
					<TimeTile activeMs={stats.activeMs} todayMinutes={minutes.total} />
					<WordsTile words={stats.words} />
					<SpeedTile
						stats={stats}
						trend={(trend.data?.measured ?? []).filter((b) => b.avgWpm > 0).map((b) => b.avgWpm)}
						onOpen={() => {
							onClose();
							void navigate({ to: "/tabs/stats", search: { tab: "speed" } });
						}}
					/>
					{stats.fromPercent !== null && stats.toPercent !== null && (
						<BookTile from={stats.fromPercent} to={stats.toPercent} />
					)}
					{stats.rsvp && <TimeSavedTile rsvp={stats.rsvp} />}
				</div>

				{earned.length > 0 && (
					<div className="mt-3 px-4" data-testid="summary-milestones">
						<div className={cn("mb-2", STAT_CAPTION)}>Milestones</div>
						<MedalGrid reached={earned} />
					</div>
				)}

				<DrawerFooter className="flex-row pb-6 md:justify-end">
					<Button
						variant="outline"
						className="flex-1 md:flex-none"
						disabled={!book.data}
						onClick={openCard}
						data-testid="summary-share"
					>
						<Share2 />
						Share card
					</Button>
					<Button className="flex-1 md:flex-none" onClick={onClose}>
						Done
					</Button>
				</DrawerFooter>
				{card && (
					<ShareCardSheet card={card} filename="lesefluss-session" onClose={() => setCard(null)} />
				)}
			</DrawerContent>
		</Drawer>
	);
}

/** Mounted once at the root, so it opens over whatever screen the reader closed to. */
export function SessionSummarySheet() {
	const summary = useSessionSummary();
	const { data: settings } = queryHooks.useSettings();
	const isOff = settings?.showSessionSummary === false;
	// Tracked here, always mounted: the summary publishes only after the sitting's writes,
	// and the user may have moved on by then.
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const landedOnRef = useRef<string | null>(null);
	if (isReaderPath(pathname)) landedOnRef.current = null;
	else landedOnRef.current ??= pathname;
	// Kept through the close animation, after the store has let it go.
	const shownRef = useRef<SessionSummary | null>(null);
	if (summary) shownRef.current = summary;
	const shown = shownRef.current;

	useEffect(() => {
		if (summary && isOff) dismissSummary();
	}, [summary, isOff]);

	if (!shown) return null;
	return (
		<SummaryDrawer
			key={shown.sittings[0]?.id}
			summary={shown}
			isOpen={summary !== null && settings !== undefined && !isOff}
			landedOn={landedOnRef.current}
			onClose={dismissSummary}
		/>
	);
}
