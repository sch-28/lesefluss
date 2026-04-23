import {
	IonAlert,
	IonBackButton,
	IonButton,
	IonButtons,
	IonContent,
	IonHeader,
	IonIcon,
	IonPage,
	IonSpinner,
	IonText,
	IonToolbar,
} from "@ionic/react";
import { useQuery } from "@tanstack/react-query";
import { bookOutline, hardwareChipOutline, openOutline, trashOutline } from "ionicons/icons";
import type React from "react";
import { useState } from "react";
import { useHistory, useParams } from "react-router-dom";
import CoverImage from "../../components/cover-image";
import SanitizedDescription from "../../components/sanitized-description";
import { useBLE } from "../../contexts/ble-context";
import { useBookSync } from "../../contexts/book-sync-context";
import { displayHostname } from "../../services/book-import/utils/url-guards";
import { externalSourceUrl, getCatalogBook, getCoverUrl } from "../../services/catalog/client";
import { catalogKeys } from "../../services/catalog/query-keys";
import { queryHooks } from "../../services/db/hooks";
import { bookKeys } from "../../services/db/hooks/query-keys";
import { queries } from "../../services/db/queries";
import { IS_WEB } from "../../utils/platform";
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

	if (isPending) {
		return (
			<IonPage>
				<IonContent className="ion-text-center">
					<div className="flex h-full items-center justify-center">
						<IonSpinner />
					</div>
				</IonContent>
			</IonPage>
		);
	}

	if (!book) {
		return (
			<IonPage>
				<IonHeader class="ion-no-border">
					<IonToolbar>
						<IonButtons slot="start">
							<IonBackButton defaultHref="/tabs/library" />
						</IonButtons>
					</IonToolbar>
				</IonHeader>
				<IonContent className="ion-padding">
					<IonText color="medium">
						<p>Book not found.</p>
					</IonText>
				</IonContent>
			</IonPage>
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
	const sourceLabel =
		book.source === "standard_ebooks"
			? "Standard Ebooks"
			: book.source === "gutenberg"
				? "Project Gutenberg"
				: book.source === "url" && book.sourceUrl
					? displayHostname(book.sourceUrl)
					: null;

	return (
		<IonPage>
			<IonHeader class="ion-no-border">
				<IonToolbar>
					<IonButtons slot="start">
						<IonBackButton defaultHref="/tabs/library" />
					</IonButtons>
					<IonButtons slot="end">
						{externalUrl && (
							<IonButton
								href={externalUrl}
								target="_blank"
								rel="noopener noreferrer"
								aria-label="View original source"
								title="View original source"
							>
								<IonIcon slot="icon-only" icon={openOutline} />
							</IonButton>
						)}
						<IonButton
							color="danger"
							onClick={() => setIsDeleteOpen(true)}
							aria-label="Delete book"
							title="Delete book"
						>
							<IonIcon slot="icon-only" icon={trashOutline} />
						</IonButton>
					</IonButtons>
				</IonToolbar>
			</IonHeader>
			<IonContent>
				<div className="book-detail-page">
					<div className="book-detail-hero">
						<div className="book-detail-cover">
							<CoverImage
								src={cover}
								alt=""
								priority
								fallback={
									<div className="book-detail-cover-placeholder">
										<IonIcon icon={bookOutline} />
									</div>
								}
							/>
						</div>
						<div className="book-detail-meta">
							{sourceLabel && <span className="book-detail-eyebrow">{sourceLabel}</span>}
							<h1 className="book-detail-title">{book.title}</h1>
							{book.author && <p className="book-detail-author">{book.author}</p>}
							<div className="book-detail-stats">
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
							</div>
						</div>
					</div>

					<div className="book-detail-actions">
						<IonButton expand="block" onClick={() => history.push(`/tabs/reader/${book.id}`)}>
							<IonIcon slot="start" icon={bookOutline} />
							Open reader
						</IonButton>
						{!IS_WEB && (
							<IonButton
								expand="block"
								fill="outline"
								disabled={!isConnected || isTransferring}
								onClick={() => setIsTransferOpen(true)}
							>
								<IonIcon slot="start" icon={hardwareChipOutline} />
								{isConnected ? "Set active on device" : "Device not connected"}
							</IonButton>
						)}
					</div>

					{catalogMeta?.subjects && catalogMeta.subjects.length > 0 && (
						<div className="book-detail-subjects">
							{catalogMeta.subjects.slice(0, 8).map((s) => (
								<span key={s} className="book-detail-subject">
									{s}
								</span>
							))}
						</div>
					)}

					{(catalogMeta?.description || catalogMeta?.summary) && (
						<section className="book-detail-card">
							<h2 className="book-detail-section-title">About</h2>
							{catalogMeta.description ? (
								<SanitizedDescription
									className="book-detail-description"
									html={catalogMeta.description}
								/>
							) : (
								<p className="book-detail-summary">{catalogMeta.summary}</p>
							)}
						</section>
					)}
				</div>

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
			</IonContent>
		</IonPage>
	);
};

export default LibraryBookDetail;
