import { IonAlert, IonButton, IonIcon, IonSpinner } from "@ionic/react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
	chevronDown,
	chevronUp,
	flashOutline,
	openOutline,
	timeOutline,
	trashOutline,
} from "ionicons/icons";
import { useMemo, useState } from "react";
import { useHistory } from "react-router-dom";
import { queryHooks } from "../../services/db/hooks";
import { bookKeys } from "../../services/db/hooks/query-keys";
import { queries } from "../../services/db/queries";
import type { Book, ReadingSession } from "../../services/db/schema";
import { formatDuration } from "../../utils/date-utils";

type Props = { mode: "global" } | { mode: "book"; bookId: string };

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

export function SessionTable(props: Props) {
	const isGlobal = props.mode === "global";

	const globalQuery = queryHooks.useAllReadingSessions();
	const bookQuery = queryHooks.useReadingSessionsByBook(isGlobal ? "" : props.bookId);
	const sessionsQuery = isGlobal ? globalQuery : bookQuery;

	const allBooksQuery = useQuery({
		queryKey: bookKeys.allIncludingChapters,
		queryFn: () => queries.getAllBooks(),
		enabled: isGlobal,
	});
	const singleBookQuery = queryHooks.useBook(isGlobal ? "" : props.bookId);

	const bookMap = useMemo(() => {
		const m = new Map<string, Book>();
		if (isGlobal) {
			for (const b of allBooksQuery.data ?? []) m.set(b.id, b);
		} else if (singleBookQuery.data) {
			m.set(singleBookQuery.data.id, singleBookQuery.data);
		}
		return m;
	}, [isGlobal, allBooksQuery.data, singleBookQuery.data]);

	const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

	const deleteMutation = queryHooks.useDeleteReadingSession();

	const sessions = sessionsQuery.data ?? [];
	const visible = sessions.slice(0, visibleCount);
	const hasMore = sessions.length > visibleCount;

	if (sessionsQuery.isPending) {
		return (
			<section className="book-detail-card mt-4">
				<h2 className="book-detail-section-title">Sessions</h2>
				<div className="flex items-center justify-center py-6">
					<IonSpinner name="crescent" />
				</div>
			</section>
		);
	}

	if (sessions.length === 0) return null;

	return (
		<motion.section
			initial={{ opacity: 0, y: 12 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, amount: 0.15 }}
			transition={{ duration: 0.4 }}
			className="book-detail-card mt-4"
		>
			<h2 className="book-detail-section-title">
				Sessions <span className="opacity-60">· {sessions.length}</span>
			</h2>

			<ul className="session-table-list mt-2">
				{visible.map((s) => (
					<SessionRow
						key={s.id}
						session={s}
						book={bookMap.get(s.bookId) ?? null}
						showBook={isGlobal}
						isExpanded={expandedId === s.id}
						onToggle={() => setExpandedId((id) => (id === s.id ? null : s.id))}
						onRequestDelete={() => setPendingDeleteId(s.id)}
					/>
				))}
			</ul>

			{hasMore && (
				<div className="mt-2 flex justify-center">
					<IonButton
						fill="clear"
						size="small"
						onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
					>
						Show more ({sessions.length - visibleCount} left)
					</IonButton>
				</div>
			)}

			<IonAlert
				isOpen={pendingDeleteId !== null}
				onDidDismiss={() => setPendingDeleteId(null)}
				header="Delete session?"
				message="This session will be removed from your reading history on every device."
				buttons={[
					{ text: "Cancel", role: "cancel" },
					{
						text: "Delete",
						role: "destructive",
						handler: () => {
							const id = pendingDeleteId;
							if (!id) return;
							deleteMutation.mutate(id);
							if (expandedId === id) setExpandedId(null);
						},
					},
				]}
				cssClass="rsvp-alert"
			/>
		</motion.section>
	);
}

type RowProps = {
	session: ReadingSession;
	book: Book | null;
	showBook: boolean;
	isExpanded: boolean;
	onToggle: () => void;
	onRequestDelete: () => void;
};

function SessionRow({ session, book, showBook, isExpanded, onToggle, onRequestDelete }: RowProps) {
	const history = useHistory();
	const dateLabel = formatSessionDate(session.startedAt);

	const size = book?.size ?? 0;
	const deltaPct = size > 0 ? ((session.endPos - session.startPos) / size) * 100 : null;
	const startPct = size > 0 ? (session.startPos / size) * 100 : null;
	const endPct = size > 0 ? (session.endPos / size) * 100 : null;

	const openBook = () => history.push(`/tabs/library/book/${session.bookId}`);

	return (
		<li className="session-table-row">
			<button
				type="button"
				className="session-table-row-button"
				onClick={onToggle}
				aria-expanded={isExpanded}
			>
				<div className="min-w-0 flex-1">
					<div className="truncate text-sm">
						{showBook ? (book?.title ?? "Unknown book") : dateLabel}
					</div>
					{showBook && (
						<div className="mt-0.5 truncate text-[0.75rem] opacity-60">{dateLabel}</div>
					)}
				</div>
				<div className="shrink-0 text-right text-xs tabular-nums opacity-80">
					<div>
						{formatDuration(session.durationMs)}
						{session.wpmAvg != null && (
							<span className="opacity-70"> · {session.wpmAvg} wpm</span>
						)}
					</div>
					{deltaPct !== null && (
						<div className="opacity-60">
							{formatPercent(deltaPct)} · {session.wordsRead} words
						</div>
					)}
				</div>
				<IonIcon
					icon={isExpanded ? chevronUp : chevronDown}
					className="shrink-0 text-base opacity-50"
				/>
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
									<span className="inline-flex items-center gap-1 opacity-80">
										<IonIcon icon={timeOutline} className="text-sm opacity-70" />
										{formatTimeRange(session.startedAt, session.endedAt)}
									</span>
									{session.wpmAvg != null && (
										<span className="inline-flex items-center gap-1 opacity-80">
											<IonIcon icon={flashOutline} className="text-sm opacity-70" />
											{session.wpmAvg} wpm
										</span>
									)}
								</div>
								<div className="flex shrink-0 items-center gap-2">
									{showBook && (
										<button
											type="button"
											onClick={openBook}
											aria-label="Open book"
											className="flex h-6 w-6 items-center justify-center border-0 bg-transparent p-0 text-inherit opacity-70 active:opacity-40"
										>
											<IonIcon icon={openOutline} className="text-base" />
										</button>
									)}
									<button
										type="button"
										onClick={onRequestDelete}
										aria-label="Delete session"
										className="flex h-6 w-6 items-center justify-center border-0 bg-transparent p-0 text-[color:var(--ion-color-danger)] opacity-80 active:opacity-40"
									>
										<IonIcon icon={trashOutline} className="text-base" />
									</button>
								</div>
							</div>
							{startPct !== null && endPct !== null && (
								<div className="opacity-70">
									<span className="opacity-70">Position:</span>{" "}
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

function ModeBadge({ mode }: { mode: ReadingSession["mode"] }) {
	const label = mode === "rsvp" ? "RSVP" : mode === "scroll" ? "Scroll" : "Page";
	return <span className="session-table-mode-badge">{label}</span>;
}

function formatPercent(value: number): string {
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

function formatTimeRange(start: number, end: number): string {
	const fmt = (t: number) => {
		const d = new Date(t);
		const hh = String(d.getHours()).padStart(2, "0");
		const mm = String(d.getMinutes()).padStart(2, "0");
		return `${hh}:${mm}`;
	};
	return `${fmt(start)} → ${fmt(end)}`;
}
