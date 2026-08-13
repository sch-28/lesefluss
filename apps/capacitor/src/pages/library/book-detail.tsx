import { displayHostname } from "@lesefluss/book-import";
import { isSyncEligible, readingProgress, wordPos } from "@lesefluss/core";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { BookOpen, Cpu, Pencil, Trash2 } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DeviceBadge } from "../../components/device-sync";
import { useBookSync } from "../../contexts/book-sync-context";
import { useBookDeviceState } from "../../contexts/device-library-context";
import { useSyncContext } from "../../contexts/sync-context";
import { useBookDeviceActions } from "../../hooks/use-book-device-actions";
import { externalSourceUrl, getCatalogBook, getCoverUrl } from "../../services/catalog/client";
import { catalogKeys } from "../../services/catalog/query-keys";
import { queryHooks } from "../../services/db/hooks";
import { bookKeys } from "../../services/db/hooks/query-keys";
import { queries } from "../../services/db/queries";
import { parseChapters } from "../../services/db/queries/books";
import { IS_WEB } from "../../utils/platform";
import { bookPageCount } from "../../utils/reading-time";
import { DetailShell } from "../_shared/detail-shell";
import { BookChapters } from "./book-chapters";
import BookEditSheet, {
	type BookEditValues,
	bookToEditValues,
	editValuesToPatch,
} from "./book-edit-sheet";
import { BookFileCard } from "./book-file-card";
import { BookHighlights } from "./book-highlights";
import { BookJourney } from "./book-journey";
import { BookStatsCard } from "./book-stats-card";
import { SessionTable } from "./session-table";

import TransferModal from "./transfer-modal";

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
	const { data: allBooks } = queryHooks.useBooks();
	const { data: highlights = [] } = useQuery({
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
	const deleteMutation = queryHooks.useDeleteBook();
	const updateMutation = queryHooks.useUpdateBook();
	const [isTransferOpen, setIsTransferOpen] = useState(false);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [isEditOpen, setIsEditOpen] = useState(false);

	// Everything below this line MUST stay above the `if (isPending)` /
	// `if (!book)` early returns. Hooks called only on the loaded-book path
	// (e.g. useBookDeviceState, useBookDeviceActions) trigger React error
	// #310 on the first to second render transition because the hook count
	// would differ between renders.
	const headerActions = useMemo(
		() => [
			{ label: "Edit", icon: Pencil, onClick: () => setIsEditOpen(true) },
			{
				label: "Delete",
				icon: Trash2,
				destructive: true,
				onClick: () => setIsDeleteOpen(true),
			},
		],
		[],
	);
	// Memoised because the sheet reseeds its form whenever `initial` changes; a
	// fresh object every render would discard what the reader is typing.
	const editValues = useMemo<BookEditValues>(
		() =>
			bookToEditValues(
				book ?? {
					title: "",
					author: null,
					description: null,
					language: null,
					status: null,
					rating: null,
					review: null,
					tags: null,
				},
			),
		[book],
	);
	const deviceState = useBookDeviceState(book?.id ?? null);
	const deviceActions = useBookDeviceActions({
		bookId: book?.id ?? null,
		bookTitle: book?.title,
		onUpload: () => setIsTransferOpen(true),
	});

	if (isPending) {
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
	const chapters = parseChapters(content?.chapters ?? null);
	const chapterCount = chapters.length;

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

	const facts = [
		pages !== null ? `${pages.toLocaleString()} pages` : null,
		chapterCount > 0 ? `${chapterCount} chapters` : null,
		`${progress}% read`,
		book.fileFormat.toUpperCase(),
		highlights.length > 0
			? `${highlights.length} highlight${highlights.length === 1 ? "" : "s"}`
			: null,
		deviceState.isReachable && deviceState.isOnDevice ? (
			<DeviceBadge bookId={book.id} style="text" />
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
				description={
					catalogMeta ? { html: catalogMeta.description, text: catalogMeta.summary } : undefined
				}
				externalLink={externalUrl ? { href: externalUrl } : undefined}
				headerActions={headerActions}
			>
				{isLoggedIn && !isSyncEligible(book) && (
					<div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-700 text-sm dark:text-amber-400">
						Stored on this device only. Too large to sync to the cloud.
					</div>
				)}
				<BookStatsCard book={book} />
				<BookJourney book={book} />
				<BookFileCard book={book} chapterCount={chapterCount} />
				<BookChapters
					chapters={chapters}
					wordCount={book.wordCount}
					wordPosition={book.wordPosition}
					onJump={handleChapterJump}
				/>
				<BookHighlights highlights={highlights} />
				<SessionTable mode="book" bookId={book.id} />
			</DetailShell>

			{!IS_WEB && (
				<TransferModal
					isOpen={isTransferOpen}
					book={isTransferOpen ? book : null}
					activeBook={activeBook}
					onDismiss={() => setIsTransferOpen(false)}
				/>
			)}

			<BookEditSheet
				isOpen={isEditOpen}
				onClose={() => setIsEditOpen(false)}
				initial={editValues}
				progress={{ wordCount: book.wordCount, wordPosition: book.wordPosition }}
				isSaving={updateMutation.isPending}
				onSave={(values) => {
					updateMutation.mutate(
						{ id: book.id, values: editValuesToPatch(values) },
						{ onSuccess: () => setIsEditOpen(false) },
					);
				}}
			/>

			<AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete book?</AlertDialogTitle>
						<AlertDialogDescription>
							"{book.title}" will be removed from your library.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={() => {
								deleteMutation.mutate(book, {
									onSuccess: () => router.navigate({ to: "/tabs/library", replace: true }),
								});
							}}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
};

export default LibraryBookDetail;
