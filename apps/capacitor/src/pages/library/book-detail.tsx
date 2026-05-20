import { displayHostname } from "@lesefluss/book-import";
import { useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
import { BookOpen, Cpu, Trash2 } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { useBLE } from "../../contexts/ble-context";
import { useBookSync } from "../../contexts/book-sync-context";
import { externalSourceUrl, getCatalogBook, getCoverUrl } from "../../services/catalog/client";
import { catalogKeys } from "../../services/catalog/query-keys";
import { queryHooks } from "../../services/db/hooks";
import { bookKeys } from "../../services/db/hooks/query-keys";
import { queries } from "../../services/db/queries";
import { IS_WEB } from "../../utils/platform";
import { DetailShell } from "../_shared/detail-shell";
import { BookStatsCard } from "./book-stats-card";
import { SessionTable } from "./session-table";
import { readingProgress } from "./sort-filter";
import TransferModal from "./transfer-modal";

interface Props {
	id?: string;
}

const LibraryBookDetail: React.FC<Props> = ({ id: propId }) => {
	const id = propId ?? "";
	const router = useRouter();
	const { isConnected } = useBLE();
	const { activeBookId, isTransferring } = useBookSync();

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

	const deleteMutation = queryHooks.useDeleteBook();
	const [isTransferOpen, setIsTransferOpen] = useState(false);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);

	// Hoisted so hook order stays stable across the early returns below
	// (otherwise React error #310 on the first→second render transition).
	const deleteHeaderAction = useMemo(
		() => ({
			label: "Delete",
			icon: Trash2,
			destructive: true,
			onClick: () => setIsDeleteOpen(true),
		}),
		[],
	);

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
	const isActive = book.id === activeBookId;
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

	const statsLine = (
		<>
			<span>{progress}% read</span>
			<span>·</span>
			<span>
				{highlights.length} highlight{highlights.length === 1 ? "" : "s"}
			</span>
			{isActive && (
				<>
					<span>·</span>
					<span className="text-primary">On device</span>
				</>
			)}
		</>
	);

	const secondaryActions = !IS_WEB
		? [
				{
					label: isConnected ? "Set active on device" : "Device not connected",
					icon: Cpu,
					onClick: () => setIsTransferOpen(true),
					disabled: !isConnected || isTransferring,
				},
			]
		: [];

	return (
		<>
			<DetailShell
				cover={cover}
				eyebrow={eyebrow}
				title={book.title}
				author={book.author}
				statsLine={statsLine}
				subjects={catalogMeta?.subjects ?? undefined}
				primaryAction={{
					label: "Open reader",
					icon: BookOpen,
					onClick: () =>
						router.navigate({ to: "/tabs/reader/$id", params: { id: book.id } }),
				}}
				secondaryActions={secondaryActions}
				description={
					catalogMeta ? { html: catalogMeta.description, text: catalogMeta.summary } : undefined
				}
				externalLink={externalUrl ? { href: externalUrl } : undefined}
				headerAction={deleteHeaderAction}
			>
				<BookStatsCard bookId={book.id} />
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
									onSuccess: () =>
										router.navigate({ to: "/tabs/library", replace: true }),
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
