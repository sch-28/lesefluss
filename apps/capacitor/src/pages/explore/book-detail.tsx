import { useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@lesefluss/ui/alert-dialog";
import { BookOpen, Download } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { externalSourceUrl, getCatalogBook, getCoverUrl } from "../../services/catalog/client";
import { importFromCatalog } from "../../services/catalog/import";
import { catalogKeys } from "../../services/catalog/query-keys";
import { bookKeys } from "../../services/db/hooks/query-keys";
import { queries } from "../../services/db/queries";
import { scheduleSyncPush } from "../../services/sync";
import { DetailShell } from "../_shared/detail-shell";

interface Props {
	catalogId?: string;
}

const ExploreBookDetail: React.FC<Props> = ({ catalogId: propCatalogId }) => {
	// react-router v5 path params arrive URL-encoded. Decode once so every
	// downstream call (DB lookup, catalog fetch, query keys) sees canonical id.
	const catalogId = decodeURIComponent(propCatalogId ?? "");
	const router = useRouter();
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
		enabled: !!catalogId,
	});

	const { data: existing } = useQuery({
		queryKey: catalogKeys.localByCatalogId(catalogId),
		queryFn: () => queries.getBookByCatalogId(catalogId),
		enabled: !!catalogId,
	});

	const importMutation = useMutation({
		mutationFn: () => importFromCatalog(catalogId, (pct) => setImportProgress(pct)),
		onSuccess: ({ existed }) => {
			qc.invalidateQueries({ queryKey: bookKeys.all });
			qc.invalidateQueries({ queryKey: bookKeys.covers });
			qc.invalidateQueries({ queryKey: catalogKeys.localByCatalogId(catalogId) });
			if (!existed) scheduleSyncPush();
			router.navigate({ to: "/tabs/library", replace: true });
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
				title={isError && error instanceof Error ? "Couldn't load book" : "Loading..."}
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

	const primary = existing
		? {
				label: "Open in Library",
				icon: BookOpen,
				onClick: () =>
					router.navigate({
						to: "/tabs/library/book/$id",
						params: { id: existing.id },
						replace: true,
					}),
			}
		: book.epubUrl
			? {
					label: isImporting ? "Downloading..." : "Download",
					icon: Download,
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
			<AlertDialog
				open={!!importMutation.error}
				onOpenChange={(open) => !open && importMutation.reset()}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Download failed</AlertDialogTitle>
						<AlertDialogDescription>
							{importMutation.error instanceof Error
								? importMutation.error.message
								: "An unknown error occurred."}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogAction onClick={() => importMutation.reset()}>OK</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
};

export default ExploreBookDetail;
