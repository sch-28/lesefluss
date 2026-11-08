import { displayHostname } from "@lesefluss/book-import";
import {
	BOOK_STATUS_LABELS,
	bookStatus,
	isSyncEligible,
	parseBookTags,
	readingProgress,
	wordPos,
} from "@lesefluss/core";
import { RatingStars } from "@lesefluss/ui/rating-stars";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import {
	BookOpen,
	Cpu,
	Image as ImageIcon,
	Layers,
	MoreVertical,
	Pencil,
	Plus,
	Users,
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatSeriesNumber } from "../../components/collections/series-numbering";
import { DeviceBadge } from "../../components/device-sync";
import { ShareCardSheet } from "../../components/share-card/share-card-sheet";
import { SpeedChip } from "../../components/speed-chip/speed-chip";
import { useBookSync } from "../../contexts/book-sync-context";
import { useBookDeviceState } from "../../contexts/device-library-context";
import { useSyncContext } from "../../contexts/sync-context";
import { useBookChapters } from "../../hooks/use-book-chapters";
import { useBookDeviceActions } from "../../hooks/use-book-device-actions";
import { externalSourceUrl, getCatalogBook, getCoverUrl } from "../../services/catalog/client";
import { catalogKeys } from "../../services/catalog/query-keys";
import { queryHooks } from "../../services/db/hooks";
import { bookKeys, syncKeys } from "../../services/db/hooks/query-keys";
import { useCloudStorage } from "../../services/db/hooks/use-cloud-storage";
import { queries } from "../../services/db/queries";
import { finishedCardData } from "../../services/share-card/card-data";
import { SYNC_ENABLED } from "../../services/sync";
import { getServerContentIds } from "../../services/sync/server-content-cache";
import { IS_WEB } from "../../utils/platform";
import { bookPageCount } from "../../utils/reading-time";
import { DetailShell } from "../_shared/detail-shell";
import { useBookActions } from "./book-actions/use-book-actions";
import {
	BookBuddyRead,
	BUDDY_READ_BLOCKER_TEXT,
	StartBuddyReadSheet,
	shareBlockerFor,
	useBookBuddyRead,
} from "./book-buddy-read";
import { BookChapters } from "./book-chapters";
import { BookFileCard } from "./book-file-card";
import { BookHighlights } from "./book-highlights";
import { BookJourney } from "./book-journey";
import { BookSessions } from "./book-sessions";
import { BookShares } from "./book-shares";
import { BookStatsCard } from "./book-stats-card";
import { GoalCard } from "./reading-goal/goal-card";

import TransferModal from "./transfer-modal";
import { useBookDetailReady } from "./use-book-detail-ready";
import { useAuthorSeriesSuggestion, useBookSeries } from "./use-book-series";

interface Props {
	id?: string;
}

const LibraryBookDetail: React.FC<Props> = ({ id: propId }) => {
	const id = propId ?? "";
	const router = useRouter();
	const { activeBookId, isTransferring } = useBookSync();
	const { isLoggedIn } = useSyncContext();

	const { data: book, isPending } = queryHooks.useBook(id);
	const { data: content } = queryHooks.useBookContent(id);
	const { chapters, isResolved: areChaptersResolved } = useBookChapters(id);
	const { data: allBooks } = queryHooks.useBooks();
	const { data: speedModel } = queryHooks.useStatsSpeedModel();
	const { data: highlights = [], isLoading: isHighlightsLoading } = useQuery({
		queryKey: bookKeys.highlights(id),
		queryFn: () => queries.getHighlightsByBook(id),
		enabled: !!id,
	});

	const { data: catalogMeta } = useQuery({
		queryKey: book?.catalogId ? catalogKeys.book(book.catalogId) : ["catalog", "book", "noop"],
		queryFn: ({ signal }) =>
			book?.catalogId ? getCatalogBook(book.catalogId, signal) : Promise.resolve(null),
		enabled: !!book?.catalogId,
	});

	const queryClient = useQueryClient();
	const jumpInFlightRef = useRef(false);
	const isMountedRef = useRef(true);
	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
		};
	}, []);
	const [isTransferOpen, setIsTransferOpen] = useState(false);
	const [isBuddyReadOpen, setIsBuddyReadOpen] = useState(false);
	const [isCardOpen, setIsCardOpen] = useState(false);
	const isFinished = book ? bookStatus(book) === "finished" && book.finishedAt !== null : false;
	const { data: bookSessions } = queryHooks.useBookReadingSessions(isCardOpen ? id : "");
	const finishedCard = useMemo(() => {
		if (!isCardOpen || !book || book.finishedAt === null || !bookSessions) return null;
		return finishedCardData({
			book: {
				title: book.title,
				author: book.author,
				coverImage: allBooks?.covers.get(book.id) ?? null,
				wordCount: book.wordCount,
				finishedAt: book.finishedAt,
			},
			sessions: bookSessions,
			model: speedModel,
		});
	}, [isCardOpen, book, bookSessions, allBooks, speedModel]);
	const canShare = isLoggedIn && SYNC_ENABLED;
	const buddyRead = useBookBuddyRead(book ?? { originKey: null }, canShare);
	const hasRunningBuddyRead = buddyRead?.status === "in_progress";
	const { data: cloudStorage } = useCloudStorage(isLoggedIn && SYNC_ENABLED);
	// Whether the server holds this book's text: sharing copies server-side, so a
	// book that never reached the cloud has nothing to copy yet.
	const { data: serverContentIds } = useQuery({
		queryKey: syncKeys.serverContentIds,
		queryFn: getServerContentIds,
		enabled: canShare && isBuddyReadOpen,
		staleTime: 0,
	});

	// Everything below this line MUST stay above the `if (isPending)` /
	// `if (!book)` early returns. Hooks called only on the loaded-book path
	// (e.g. useBookDeviceState, useBookDeviceActions) trigger React error
	// #310 on the first to second render transition because the hook count
	// would differ between renders.
	const series = useBookSeries(id);
	const seriesSuggestion = useAuthorSeriesSuggestion(id, book?.author ?? null);
	const addNumbered = queryHooks.useAddNumberedBooks();
	const bookActions = useBookActions({
		surface: "detail",
		onDeleted: () => router.navigate({ to: "/tabs/library", replace: true }),
		extras: () => [
			...(isFinished
				? [{ label: "Share card", icon: ImageIcon, onSelect: () => setIsCardOpen(true) }]
				: []),
			// Shown signed out too: the sheet explains that reading together needs an account.
			...(SYNC_ENABLED && !hasRunningBuddyRead
				? [{ label: "Start buddy read", icon: Users, onSelect: () => setIsBuddyReadOpen(true) }]
				: []),
		],
	});
	const openBookMenu = bookActions.open;
	const headerActions = useMemo(
		() => [
			{
				label: "Edit",
				icon: Pencil,
				onClick: () =>
					void router.navigate({
						to: "/tabs/library/book/$id/edit",
						params: { id },
						search: { from: "detail" },
					}),
			},
			{
				label: "More actions",
				icon: MoreVertical,
				onClick: () => {
					if (book) openBookMenu(book);
				},
			},
		],
		[router, id, book, openBookMenu],
	);
	const deviceState = useBookDeviceState(book?.id ?? null);
	const deviceActions = useBookDeviceActions({
		bookId: book?.id ?? null,
		bookTitle: book?.title,
		onUpload: () => setIsTransferOpen(true),
	});
	const areCardsReady = useBookDetailReady(book);

	if (isPending || (book && (!areCardsReady || isHighlightsLoading))) {
		return (
			<DetailShell
				cover={null}
				title="Loading..."
				primaryAction={{ label: "Loading", onClick: () => undefined, disabled: true }}
				isLoading
			/>
		);
	}

	if (!book) {
		return (
			<DetailShell
				cover={null}
				title="Book not found"
				primaryAction={{
					label: "Back to library",
					onClick: () => router.navigate({ to: "/tabs/library", replace: true }),
				}}
				errorMessage="Book not found."
			/>
		);
	}

	const cover = content?.coverImage
		? content.coverImage
		: book.catalogId
			? getCoverUrl(book.catalogId)
			: null;
	const progress = readingProgress(book);
	const externalUrl = book.sourceUrl
		? book.sourceUrl
		: book.catalogId
			? externalSourceUrl(book.catalogId)
			: null;
	const activeBook = allBooks?.books.find((b) => b.id === activeBookId) ?? null;
	const eyebrow =
		book.source === "standard_ebooks"
			? "Standard Ebooks"
			: book.source === "gutenberg"
				? "Project Gutenberg"
				: book.source === "url" && book.sourceUrl
					? displayHostname(book.sourceUrl)
					: null;

	// Pages, not time: time measures the reader, so two books at nine and four
	// hours say nothing comparable about the books.
	const pages = bookPageCount(book);
	const chapterCount = chapters.length;
	const notBackedUpIds = new Set(cloudStorage?.notBackedUp.map((b) => b.id));
	const isNotBackedUp = notBackedUpIds.has(book.id);
	const shareBlocker = shareBlockerFor(book, serverContentIds, notBackedUpIds);

	// Same two steps the reader takes for an in-book jump: persist the position,
	// then let the seed effect resume from it.
	//
	// `finishedAt` is passed through deliberately. `updateBook` stamps it whenever
	// a written position crosses the finished threshold, so jumping to a trailing
	// chapter (an epilogue, acknowledgements) would mark an unread book finished,
	// permanently: the column is never cleared. Supplying the current value skips
	// that branch entirely.
	const handleChapterJump = async (startWord: number) => {
		if (jumpInFlightRef.current) return;
		jumpInFlightRef.current = true;
		try {
			await queries.updateBook(book.id, {
				wordPosition: wordPos(startWord),
				finishedAt: book.finishedAt,
			});
			// `exact` matters: bookKeys.detail is a prefix of the content and
			// word-index keys, so a broad invalidation re-reads the whole book text
			// before navigating.
			await queryClient.invalidateQueries({ queryKey: bookKeys.detail(book.id), exact: true });
			if (!isMountedRef.current) return;
			router.navigate({ to: "/tabs/reader/$id", params: { id: book.id } });
		} finally {
			jumpInFlightRef.current = false;
		}
	};

	const tags = parseBookTags(book.tags);
	const facts = [
		// The shelf leads: it is the one fact the reader chose rather than earned.
		BOOK_STATUS_LABELS[bookStatus(book)],
		series ? (
			<button
				key="series"
				type="button"
				data-testid="book-series-chip"
				onClick={() =>
					router.navigate({ to: "/tabs/library", search: { collection: series.collectionId } })
				}
				className="inline-flex items-center gap-1 text-foreground underline-offset-2 hover:underline"
			>
				<Layers className="size-3" />
				{series.index === null ? series.name : `${series.name} ${formatSeriesNumber(series.index)}`}
			</button>
		) : seriesSuggestion ? (
			<button
				key="series-suggestion"
				type="button"
				data-testid="book-series-suggestion"
				disabled={addNumbered.isPending}
				onClick={() =>
					addNumbered.mutate({
						target: { collectionId: seriesSuggestion.collectionId },
						numbers: new Map([[book.id, seriesSuggestion.index]]),
					})
				}
				className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
			>
				<Plus className="size-3" />
				{`Add to ${seriesSuggestion.name} ${formatSeriesNumber(seriesSuggestion.index)}?`}
			</button>
		) : null,
		book.rating !== null ? <RatingStars key="rating" rating={book.rating} /> : null,
		pages !== null ? `${pages.toLocaleString()} pages` : null,
		chapterCount > 0 ? `${chapterCount} chapters` : null,
		`${progress}% read`,
		speedModel ? (
			<SpeedChip
				key="speed"
				bare
				book={{
					id: book.id,
					wordsLeft:
						book.finishedAt === null && book.wordCount > 0
							? book.wordCount - book.wordPosition
							: null,
				}}
			/>
		) : null,
		book.fileFormat.toUpperCase(),
		highlights.length > 0
			? `${highlights.length} highlight${highlights.length === 1 ? "" : "s"}`
			: null,
		deviceState.isReachable && deviceState.isOnDevice ? (
			<DeviceBadge key="device" bookId={book.id} style="text" />
		) : null,
	].filter((fact) => fact !== null);

	const secondaryActions = !IS_WEB
		? deviceActions.map((a) => ({
				label: a.label,
				icon: a.icon ?? Cpu,
				onClick: a.onSelect,
				disabled: a.disabled || isTransferring,
			}))
		: [];

	return (
		<>
			<DetailShell
				cover={cover}
				eyebrow={eyebrow}
				title={book.title}
				author={book.author}
				facts={facts}
				subjects={catalogMeta?.subjects ?? undefined}
				primaryAction={{
					label: "Open reader",
					icon: BookOpen,
					onClick: () => router.navigate({ to: "/tabs/reader/$id", params: { id: book.id } }),
				}}
				secondaryActions={secondaryActions}
				// The reader's own description wins over the catalog blurb: they wrote
				// it knowing the catalog one was there.
				description={
					book.description
						? { text: book.description }
						: catalogMeta
							? { html: catalogMeta.description, text: catalogMeta.summary }
							: undefined
				}
				externalLink={externalUrl ? { href: externalUrl } : undefined}
				headerActions={headerActions}
			>
				{isLoggedIn && !isSyncEligible(book) && (
					<div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-700 text-sm dark:text-amber-400">
						Stored on this device only. Too large to sync to the cloud.
					</div>
				)}
				{isLoggedIn && isNotBackedUp && (
					<div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-700 text-sm dark:text-amber-400">
						Not backed up: not enough cloud storage, so this book stays on this device only.
					</div>
				)}
				{tags.length > 0 && (
					<div className="flex flex-wrap gap-1.5">
						{tags.map((tag) => (
							<span
								key={tag}
								className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-muted-foreground text-xs"
							>
								{tag}
							</span>
						))}
					</div>
				)}
				{book.review && (
					<section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
						<h2 className="m-0 mb-2 font-semibold text-base">Your notes</h2>
						<p className="m-0 whitespace-pre-wrap text-foreground/80 text-sm leading-relaxed">
							{book.review}
						</p>
					</section>
				)}
				<GoalCard book={book} />
				<BookStatsCard book={book} />
				{canShare && <BookShares bookId={book.id} enabled={!book.seriesId} />}
				{canShare && buddyRead && <BookBuddyRead read={buddyRead} book={book} />}
				<BookJourney book={book} />
				<BookFileCard book={book} chapterCount={chapterCount} />
				<BookChapters
					chapters={chapters}
					wordCount={book.wordCount}
					wordPosition={book.wordPosition}
					onJump={handleChapterJump}
					isResolved={areChaptersResolved}
				/>
				<BookHighlights highlights={highlights} />
				<BookSessions book={book} />
			</DetailShell>

			{!IS_WEB && (
				<TransferModal
					isOpen={isTransferOpen}
					book={isTransferOpen ? book : null}
					activeBook={activeBook}
					onDismiss={() => setIsTransferOpen(false)}
				/>
			)}

			{finishedCard && (
				<ShareCardSheet
					card={finishedCard}
					filename="lesefluss-finished"
					onClose={() => setIsCardOpen(false)}
				/>
			)}
			<StartBuddyReadSheet
				isOpen={isBuddyReadOpen}
				onClose={() => setIsBuddyReadOpen(false)}
				isLoggedIn={isLoggedIn}
				bookId={book.id}
				bookTitle={book.title}
				blocker={shareBlocker ? BUDDY_READ_BLOCKER_TEXT[shareBlocker] : null}
			/>
			{bookActions.overlays}
		</>
	);
};

export default LibraryBookDetail;
