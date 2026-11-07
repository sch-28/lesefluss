import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@lesefluss/ui/alert-dialog";
import { Button } from "@lesefluss/ui/button";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronUp, Clock, Loader2, Trash2, Zap } from "lucide-react";
import { useState } from "react";
import { queryHooks } from "../../services/db/hooks";
import type { Book, ReadingSession } from "../../services/db/schema";
import { formatDuration } from "../../utils/date-utils";

type Props = { bookId: string };

const PAGE_SIZE = 20;

const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
] as const;

/** A book's sessions; the Sessions tab on the stats page holds everyone's. */
export function SessionTable({ bookId }: Props) {
	const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
	// Fetch only what is rendered: the whole table used to cross the SQLite
	// bridge on every book-detail page view.
	const sessionsQuery = queryHooks.useReadingSessionsPage(visibleCount, bookId);
	const totalQuery = queryHooks.useReadingSessionCount(bookId);
	const book = queryHooks.useBook(bookId).data ?? null;

	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

	const deleteMutation = queryHooks.useDeleteReadingSession();

	const visible = sessionsQuery.data ?? [];
	const total = totalQuery.data;
	// Falling back to a full page keeps paging reachable if the count query fails:
	// retries are disabled globally, so `total` would otherwise stay undefined.
	const hasMore = total != null ? total > visible.length : visible.length === visibleCount;

	if (sessionsQuery.isPending) {
		return (
			<section className="mt-6 rounded-lg border border-border bg-card p-4 text-card-foreground">
				<h2 className="m-0 mb-3 font-semibold text-base">Sessions</h2>
				<div className="flex items-center justify-center py-6">
					<Loader2 className="size-5 animate-spin text-muted-foreground" />
				</div>
			</section>
		);
	}

	if (visible.length === 0) return null;

	return (
		<motion.section
			initial={{ opacity: 0, y: 12 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, amount: 0.15 }}
			transition={{ duration: 0.4 }}
			className="mt-6 rounded-lg border border-border bg-card p-4 text-card-foreground"
		>
			<div className="mb-3 flex items-baseline justify-between gap-2">
				<h2 className="m-0 font-semibold text-base">
					Sessions {total != null && <span className="text-muted-foreground">· {total}</span>}
				</h2>
				<Link
					to="/tabs/library/stats"
					search={{ tab: "sessions", book: bookId }}
					className="text-primary text-sm"
				>
					See all
				</Link>
			</div>

			<ul className="m-0 list-none divide-y divide-border p-0">
				{visible.map((s) => (
					<SessionRow
						key={s.id}
						session={s}
						book={book}
						isExpanded={expandedId === s.id}
						onToggle={() => setExpandedId((id) => (id === s.id ? null : s.id))}
						onRequestDelete={() => setPendingDeleteId(s.id)}
					/>
				))}
			</ul>

			{hasMore && (
				<div className="mt-3 flex justify-center">
					<Button variant="ghost" size="sm" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
						Show more{total != null && ` (${total - visible.length} left)`}
					</Button>
				</div>
			)}

			<AlertDialog
				open={pendingDeleteId !== null}
				onOpenChange={(open) => !open && setPendingDeleteId(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete session?</AlertDialogTitle>
						<AlertDialogDescription>
							Removed from this device, from your synced history, and from other devices syncing
							reading stats when they next sync.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={() => {
								const id = pendingDeleteId;
								if (!id) return;
								deleteMutation.mutate(id);
								if (expandedId === id) setExpandedId(null);
							}}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</motion.section>
	);
}

type RowProps = {
	session: ReadingSession;
	book: Book | null;
	isExpanded: boolean;
	onToggle: () => void;
	onRequestDelete: () => void;
};

function SessionRow({ session, book, isExpanded, onToggle, onRequestDelete }: RowProps) {
	const dateLabel = formatSessionDate(session.startedAt);

	const wordCount = book?.wordCount ?? 0;
	const hasRange = wordCount > 0;
	// Share of the book actually read, derived from the same figure as the word
	// count beside it. The span between start and end position is a different
	// quantity: it includes anything skipped or re-read, so pairing the two read
	// as a contradiction ("0% · 900 words").
	const readPct = hasRange ? (session.wordsRead / wordCount) * 100 : null;
	const startPct = hasRange ? (session.startWord / wordCount) * 100 : null;
	const endPct = hasRange ? (session.endWord / wordCount) * 100 : null;

	return (
		<li>
			<button
				type="button"
				className="flex w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-0 py-3 text-left text-foreground"
				onClick={onToggle}
				aria-expanded={isExpanded}
			>
				<div className="min-w-0 flex-1">
					<div className="truncate text-sm">{dateLabel}</div>
				</div>
				<div className="shrink-0 text-right text-foreground/80 text-xs tabular-nums">
					<div>
						{formatDuration(session.durationMs)}
						{session.wpmAvg != null && (
							<span className="text-muted-foreground"> · {session.wpmAvg} wpm</span>
						)}
					</div>
					{readPct !== null && (
						<div className="text-muted-foreground">
							{formatPercent(readPct)} · {session.wordsRead} words
						</div>
					)}
				</div>
				{isExpanded ? (
					<ChevronUp className="size-4 shrink-0 text-muted-foreground" />
				) : (
					<ChevronDown className="size-4 shrink-0 text-muted-foreground" />
				)}
			</button>

			<AnimatePresence initial={false}>
				{isExpanded && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.18, ease: "easeOut" }}
						className="overflow-hidden"
					>
						<div className="space-y-1.5 pt-1 pb-3 text-xs">
							<div className="flex items-center gap-3">
								<div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
									<ModeBadge mode={session.mode} />
									<span className="inline-flex items-center gap-1 text-foreground/80">
										<Clock className="size-3.5 text-muted-foreground" />
										{formatTimeRange(session.startedAt, session.endedAt)}
									</span>
									{session.wpmAvg != null && (
										<span className="inline-flex items-center gap-1 text-foreground/80">
											<Zap className="size-3.5 text-muted-foreground" />
											{session.wpmAvg} wpm
										</span>
									)}
								</div>
								<div className="flex shrink-0 items-center gap-1">
									<Button
										variant="ghost"
										size="icon-xs"
										onClick={onRequestDelete}
										aria-label="Delete session"
										className="text-destructive hover:text-destructive"
									>
										<Trash2 />
									</Button>
								</div>
							</div>
							{startPct !== null && endPct !== null && (
								<div className="text-muted-foreground">
									<span>Position:</span>{" "}
									<span className="tabular-nums">
										{formatPercent(startPct)} → {formatPercent(endPct)}
									</span>
								</div>
							)}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</li>
	);
}

export const MODE_BADGE_LABELS: Record<ReadingSession["mode"], string> = {
	rsvp: "RSVP",
	scroll: "Scroll",
	page: "Page",
	listen: "Listen",
};

export function ModeBadge({ mode }: { mode: ReadingSession["mode"] }) {
	const label = MODE_BADGE_LABELS[mode];
	return (
		<span className="inline-flex items-center rounded-sm bg-muted px-1.5 py-0.5 font-semibold text-[0.65rem] text-muted-foreground uppercase tracking-wide">
			{label}
		</span>
	);
}

export function formatPercent(value: number): string {
	if (value <= 0) return "0%";
	if (value < 1) return "<1%";
	return `${Math.round(value)}%`;
}

function formatSessionDate(epochMs: number): string {
	const d = new Date(epochMs);
	const hh = String(d.getHours()).padStart(2, "0");
	const mm = String(d.getMinutes()).padStart(2, "0");
	return `${MONTHS[d.getMonth()]} ${d.getDate()} · ${hh}:${mm}`;
}

export function formatClock(epochMs: number): string {
	const d = new Date(epochMs);
	return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function formatTimeRange(start: number, end: number): string {
	return `${formatClock(start)} → ${formatClock(end)}`;
}
