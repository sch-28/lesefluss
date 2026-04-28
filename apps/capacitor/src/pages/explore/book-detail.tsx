import { IonAlert } from "@ionic/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { bookOutline, downloadOutline } from "ionicons/icons";
import type React from "react";
import { useState } from "react";
import { useHistory, useParams } from "react-router-dom";
import { externalSourceUrl, getCatalogBook, getCoverUrl } from "../../services/catalog/client";
import { importFromCatalog } from "../../services/catalog/import";
import { catalogKeys } from "../../services/catalog/query-keys";
import { bookKeys } from "../../services/db/hooks/query-keys";
import { queries } from "../../services/db/queries";
import { scheduleSyncPush } from "../../services/sync";
import { DetailShell } from "../_shared/detail-shell";

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

	const externalUrl = externalSourceUrl(catalogId);
	const isImporting = importMutation.isPending;

	if (isPending || isError || !book) {
		return (
			<DetailShell
				backHref="/tabs/explore"
				cover={null}
				title={isError && error instanceof Error ? "Couldn't load book" : "Loading…"}
				primaryAction={{
					label: "Loading",
					onClick: () => undefined,
					disabled: true,
				}}
				isLoading={isPending}
				errorMessage={
					isError ? (error instanceof Error ? error.message : "Failed to load book.") : undefined
				}
				externalLink={externalUrl ? { href: externalUrl } : undefined}
			/>
		);
	}

	// Branch the primary action on whether the book is already in the library
	// or whether a downloadable EPUB exists.
	const primary = existing
		? {
				label: "Open in Library",
				icon: bookOutline,
				onClick: () => history.replace(`/tabs/library/book/${existing.id}`),
			}
		: book.epubUrl
			? {
					label: isImporting ? "Downloading…" : "Download",
					icon: downloadOutline,
					onClick: () => importMutation.mutate(),
					disabled: isImporting,
					loading: isImporting,
				}
			: {
					label: "Not available as free EPUB",
					onClick: () => undefined,
					disabled: true,
				};

	return (
		<>
			<DetailShell
				backHref="/tabs/explore"
				cover={getCoverUrl(book.id, book.coverUrl)}
				eyebrow={book.source === "standard_ebooks" ? "Standard Ebooks" : undefined}
				title={book.title}
				author={book.author}
				subjects={book.subjects ?? undefined}
				primaryAction={primary}
				description={{ html: book.description, text: book.summary }}
				externalLink={externalUrl ? { href: externalUrl } : undefined}
				progress={isImporting ? importProgress : undefined}
			/>
			<IonAlert
				isOpen={!!importMutation.error}
				onDidDismiss={() => importMutation.reset()}
				header="Download failed"
				message={importMutation.error instanceof Error ? importMutation.error.message : undefined}
				buttons={[{ text: "OK", role: "cancel" }]}
				cssClass="rsvp-alert"
			/>
		</>
	);
};

export default ExploreBookDetail;
