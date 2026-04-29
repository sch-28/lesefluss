import { IonAlert } from "@ionic/react";
import { useQuery } from "@tanstack/react-query";
import { bookOutline, hardwareChipOutline, trashOutline } from "ionicons/icons";
import type React from "react";
import { useMemo, useState } from "react";
import { useHistory, useParams } from "react-router-dom";
import { useBLE } from "../../contexts/ble-context";
import { useBookSync } from "../../contexts/book-sync-context";
import { displayHostname } from "../../services/book-import/utils/url-guards";
import { externalSourceUrl, getCatalogBook, getCoverUrl } from "../../services/catalog/client";
import { catalogKeys } from "../../services/catalog/query-keys";
import { queryHooks } from "../../services/db/hooks";
import { bookKeys } from "../../services/db/hooks/query-keys";
import { queries } from "../../services/db/queries";
import { IS_WEB } from "../../utils/platform";
import { DetailShell } from "../_shared/detail-shell";
import { readingProgress } from "./sort-filter";
import TransferModal from "./transfer-modal";

const LibraryBookDetail: React.FC = () => {
	const { id } = useParams<{ id: string }>();
	const history = useHistory();
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

	// Must run unconditionally on every render to keep hook order stable.
	// The early returns below would otherwise skip it on the first render and
	// invoke it on the second, tripping React error #310.
	const deleteHeaderAction = useMemo(
		() => ({
			label: "Delete",
			icon: trashOutline,
			destructive: true,
			onClick: () => setIsDeleteOpen(true),
		}),
		[],
	);

	if (isPending) {
		return (
			<DetailShell
				cover={null}
				title="Loading…"
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
					onClick: () => history.replace("/tabs/library"),
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
			<span>{Math.round(progress * 100)}% read</span>
			<span>·</span>
			<span>
				{highlights.length} highlight{highlights.length === 1 ? "" : "s"}
			</span>
			{isActive && (
				<>
					<span>·</span>
					<span className="book-detail-stat-active">On device</span>
				</>
			)}
		</>
	);

	const secondaryActions = !IS_WEB
		? [
				{
					label: isConnected ? "Set active on device" : "Device not connected",
					icon: hardwareChipOutline,
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
					icon: bookOutline,
					onClick: () => history.push(`/tabs/reader/${book.id}`),
				}}
				secondaryActions={secondaryActions}
				description={
					catalogMeta ? { html: catalogMeta.description, text: catalogMeta.summary } : undefined
				}
				externalLink={externalUrl ? { href: externalUrl } : undefined}
				headerAction={deleteHeaderAction}
			/>

			{!IS_WEB && (
				<TransferModal
					isOpen={isTransferOpen}
					book={isTransferOpen ? book : null}
					activeBook={activeBook}
					onDismiss={() => setIsTransferOpen(false)}
				/>
			)}

			<IonAlert
				isOpen={isDeleteOpen}
				onDidDismiss={() => setIsDeleteOpen(false)}
				header="Delete book?"
				message={`"${book.title}" will be removed from your library.`}
				buttons={[
					{ text: "Cancel", role: "cancel" },
					{
						text: "Delete",
						role: "destructive",
						handler: () => {
							deleteMutation.mutate(book, {
								onSuccess: () => history.replace("/tabs/library"),
							});
						},
					},
				]}
				cssClass="rsvp-alert"
			/>
		</>
	);
};

export default LibraryBookDetail;
