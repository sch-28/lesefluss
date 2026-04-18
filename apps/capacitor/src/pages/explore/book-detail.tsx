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
	IonTitle,
	IonToolbar,
} from "@ionic/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { bookOutline, openOutline } from "ionicons/icons";
import type React from "react";
import { useState } from "react";
import { useHistory, useParams } from "react-router-dom";
import SanitizedDescription from "../../components/sanitized-description";
import { externalSourceUrl, getCatalogBook, getCoverUrl } from "../../services/catalog/client";
import { importFromCatalog } from "../../services/catalog/import";
import { catalogKeys } from "../../services/catalog/query-keys";
import { bookKeys } from "../../services/db/hooks/query-keys";
import { queries } from "../../services/db/queries";
import { scheduleSyncPush } from "../../services/sync";

const ExploreBookDetail: React.FC = () => {
	const { catalogId } = useParams<{ catalogId: string }>();
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
					<IonTitle>Book</IonTitle>
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
						<div className="book-detail-header">
							<div className="book-detail-cover">
								{coverUrl ? (
									<img src={coverUrl} alt="" />
								) : (
									<div className="book-detail-cover-placeholder">
										<IonIcon icon={bookOutline} />
									</div>
								)}
							</div>
							<div className="book-detail-meta">
								<h1>{book.title}</h1>
								{book.author && <p className="book-detail-author">{book.author}</p>}
								{isSE && <span className="explore-card-badge">Standard Ebooks</span>}
								{book.subjects && book.subjects.length > 0 && (
									<div className="book-detail-subjects">
										{book.subjects.slice(0, 6).map((s) => (
											<span key={s} className="book-detail-subject">
												{s}
											</span>
										))}
									</div>
								)}
							</div>
						</div>

						<div className="book-detail-actions">
							{existing ? (
								<IonButton
									expand="block"
									onClick={() => history.replace(`/tabs/library/book/${existing.id}`)}
								>
									Open in Library
								</IonButton>
							) : book.epubUrl ? (
								<IonButton
									expand="block"
									disabled={isImporting}
									onClick={() => importMutation.mutate()}
								>
									{isImporting ? "Importing…" : "Import"}
								</IonButton>
							) : (
								<IonText color="medium">
									<p style={{ margin: 0 }}>Not available as free EPUB.</p>
								</IonText>
							)}
							{externalUrl && (
								<IonButton
									expand="block"
									fill="clear"
									href={externalUrl}
									target="_blank"
									rel="noopener noreferrer"
								>
									<IonIcon slot="end" icon={openOutline} />
									View original source
								</IonButton>
							)}
						</div>

						{book.description ? (
							<SanitizedDescription className="book-detail-description" html={book.description} />
						) : book.summary ? (
							<p className="book-detail-summary">{book.summary}</p>
						) : null}
					</div>
				)}

				<IonAlert
					isOpen={!!importMutation.error}
					onDidDismiss={() => importMutation.reset()}
					header="Import failed"
					message={importMutation.error instanceof Error ? importMutation.error.message : undefined}
					buttons={[{ text: "OK", role: "cancel" }]}
					cssClass="rsvp-alert"
				/>
			</IonContent>
		</IonPage>
	);
};

export default ExploreBookDetail;
