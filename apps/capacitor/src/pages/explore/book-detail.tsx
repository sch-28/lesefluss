import {
	IonAlert,
	IonBackButton,
	IonButton,
	IonButtons,
	IonContent,
	IonHeader,
	IonIcon,
	IonPage,
	IonProgressBar,
	IonSpinner,
	IonText,
	IonToolbar,
} from "@ionic/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { bookOutline, downloadOutline, openOutline } from "ionicons/icons";
import type React from "react";
import { useState } from "react";
import { useHistory, useParams } from "react-router-dom";
import CoverImage from "../../components/cover-image";
import SanitizedDescription from "../../components/sanitized-description";
import { externalSourceUrl, getCatalogBook, getCoverUrl } from "../../services/catalog/client";
import { importFromCatalog } from "../../services/catalog/import";
import { catalogKeys } from "../../services/catalog/query-keys";
import { bookKeys } from "../../services/db/hooks/query-keys";
import { queries } from "../../services/db/queries";
import { scheduleSyncPush } from "../../services/sync";

const ExploreBookDetail: React.FC = () => {
	// react-router v5 doesn't decode path params, so SE ids arrive as
	// `se%3Aauthor%2Ftitle`. Decode once here so every downstream call
	// (DB lookup, catalog fetch, query keys) sees the canonical id.
	const { catalogId: rawCatalogId } = useParams<{ catalogId: string }>();
	const catalogId = decodeURIComponent(rawCatalogId);
	const history = useHistory();
	const qc = useQueryClient();
	const [importProgress, setImportProgress] = useState(0);

	const {
		data: book,
		isPending,
		isError,
		error,
	} = useQuery({
		queryKey: catalogKeys.book(catalogId),
		queryFn: ({ signal }) => getCatalogBook(catalogId, signal),
	});

	const { data: existing } = useQuery({
		queryKey: catalogKeys.localByCatalogId(catalogId),
		queryFn: () => queries.getBookByCatalogId(catalogId),
	});

	const importMutation = useMutation({
		mutationFn: () => importFromCatalog(catalogId, (pct) => setImportProgress(pct)),
		onSuccess: ({ existed }) => {
			qc.invalidateQueries({ queryKey: bookKeys.all });
			qc.invalidateQueries({ queryKey: bookKeys.covers });
			qc.invalidateQueries({ queryKey: catalogKeys.localByCatalogId(catalogId) });
			if (!existed) scheduleSyncPush();
			history.replace("/tabs/library");
		},
		onSettled: () => setImportProgress(0),
	});

	const coverUrl = book ? getCoverUrl(book.id, book.coverUrl) : null;
	const externalUrl = externalSourceUrl(catalogId);
	const isSE = book?.source === "standard_ebooks";
	const isImporting = importMutation.isPending;

	return (
		<IonPage>
			<IonHeader class="ion-no-border">
				<IonToolbar>
					<IonButtons slot="start">
						<IonBackButton defaultHref="/tabs/explore" />
					</IonButtons>
					{externalUrl && (
						<IonButtons slot="end">
							<IonButton
								href={externalUrl}
								target="_blank"
								rel="noopener noreferrer"
								aria-label="View original source"
								title="View original source"
							>
								<IonIcon slot="icon-only" icon={openOutline} />
							</IonButton>
						</IonButtons>
					)}
				</IonToolbar>
			</IonHeader>
			<IonContent>
				{isImporting && <IonProgressBar value={importProgress / 100} type="determinate" />}

				{isPending ? (
					<div className="flex h-full items-center justify-center">
						<IonSpinner />
					</div>
				) : isError ? (
					<div className="flex h-full flex-col items-center justify-center p-8 text-center">
						<IonText color="medium">
							<p style={{ margin: 0 }}>
								{error instanceof Error ? error.message : "Failed to load book."}
							</p>
						</IonText>
					</div>
				) : !book ? null : (
					<div className="book-detail-page">
						<div className="book-detail-hero">
							<div className="book-detail-cover">
								<CoverImage
									src={coverUrl}
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
								{isSE && <span className="book-detail-eyebrow">Standard Ebooks</span>}
								<h1 className="book-detail-title">{book.title}</h1>
								{book.author && <p className="book-detail-author">{book.author}</p>}
							</div>
						</div>

						<div className="book-detail-actions">
							{existing ? (
								<IonButton
									expand="block"
									onClick={() => history.replace(`/tabs/library/book/${existing.id}`)}
								>
									<IonIcon slot="start" icon={bookOutline} />
									Open in Library
								</IonButton>
							) : book.epubUrl ? (
								<IonButton
									expand="block"
									disabled={isImporting}
									onClick={() => importMutation.mutate()}
								>
									<IonIcon slot="start" icon={downloadOutline} />
									{isImporting ? "Downloading…" : "Download"}
								</IonButton>
							) : (
								<IonText color="medium">
									<p style={{ margin: 0 }}>Not available as free EPUB.</p>
								</IonText>
							)}
						</div>

						{book.subjects && book.subjects.length > 0 && (
							<div className="book-detail-subjects">
								{book.subjects.slice(0, 8).map((s) => (
									<span key={s} className="book-detail-subject">
										{s}
									</span>
								))}
							</div>
						)}

						{(book.description || book.summary) && (
							<section className="book-detail-card">
								<h2 className="book-detail-section-title">About</h2>
								{book.description ? (
									<SanitizedDescription
										className="book-detail-description"
										html={book.description}
									/>
								) : (
									<p className="book-detail-summary">{book.summary}</p>
								)}
							</section>
						)}
					</div>
				)}

				<IonAlert
					isOpen={!!importMutation.error}
					onDidDismiss={() => importMutation.reset()}
					header="Download failed"
					message={importMutation.error instanceof Error ? importMutation.error.message : undefined}
					buttons={[{ text: "OK", role: "cancel" }]}
					cssClass="rsvp-alert"
				/>
			</IonContent>
		</IonPage>
	);
};

export default ExploreBookDetail;
