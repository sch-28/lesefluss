import { Browser } from "@capacitor/browser";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { BookOpen, ExternalLink, Library, Plus, Share2 } from "lucide-react";
import type React from "react";
import {
	CATALOG_SOURCE_LABELS,
	externalSourceUrl,
	getCatalogBook,
	getCoverUrl,
} from "../../services/catalog/client";
import { catalogKeys } from "../../services/catalog/query-keys";
import { queries } from "../../services/db/queries";
import { type DetailAction, DetailShell } from "../_shared/detail-shell";
import BookDetailShelves from "./book-detail-shelves";
import { catalogFacts } from "./catalog-facts";
import { shareCatalogBook } from "./share-link";
import { rememberTagLabels } from "./tag-labels";
import { useCatalogImport } from "./use-catalog-import";
import { useReaderWpm } from "./use-reader-wpm";

interface Props {
	catalogId?: string;
}

const ExploreBookDetail: React.FC<Props> = ({ catalogId: propCatalogId }) => {
	// react-router v5 path params arrive URL-encoded. Decode once so every
	// downstream call (DB lookup, catalog fetch, query keys) sees canonical id.
	const catalogId = decodeURIComponent(propCatalogId ?? "");
	const router = useRouter();
	const importer = useCatalogImport(catalogId, { withProgress: true });
	const wpm = useReaderWpm();

	const {
		data: book,
		isPending,
		isError,
		error,
		refetch,
	} = useQuery({
		queryKey: catalogKeys.book(catalogId),
		queryFn: async ({ signal }) => {
			const result = await getCatalogBook(catalogId, signal);
			rememberTagLabels(result.tags);
			return result;
		},
		enabled: !!catalogId,
		// An uncounted book may have been counted since (another reader's
		// download, the crawler); check again whenever the page opens.
		refetchOnMount: (query) => (query.state.data?.wordCount == null ? "always" : true),
	});

	const { data: existing } = useQuery({
		queryKey: catalogKeys.localByCatalogId(catalogId),
		queryFn: () => queries.getBookByCatalogId(catalogId),
		enabled: !!catalogId,
	});

	const externalUrl = externalSourceUrl(catalogId);

	if (isPending || isError || !book) {
		return (
			<DetailShell
				backHref="/tabs/explore"
				cover={null}
				title={isError ? "Couldn't load book" : "Loading..."}
				primaryAction={{
					label: "Loading",
					onClick: () => undefined,
					disabled: true,
				}}
				isLoading={isPending}
				error={isError ? error : undefined}
				onRetry={() => refetch()}
				externalLink={externalUrl ? { href: externalUrl } : undefined}
			/>
		);
	}

	const startImport = (intent: "read" | "add") => importer.start({ title: book.title, intent });
	const isImporting = importer.isImporting;
	const isReading = isImporting && importer.intent === "read";
	// An import started from a card elsewhere shows up as "adding".
	const isAdding = isImporting && importer.intent !== "read";
	const isStandardEbooks = book.source === "standard_ebooks";
	const sourceName = CATALOG_SOURCE_LABELS[book.source];

	let primary: DetailAction;
	let secondary: DetailAction[] = [];
	if (existing) {
		primary = {
			label: "Open in Library",
			icon: Library,
			onClick: () =>
				router.navigate({
					to: "/tabs/library/book/$id",
					params: { id: existing.id },
					replace: true,
				}),
		};
	} else if (book.epubUrl) {
		primary = {
			label: isReading ? "Downloading..." : "Read now",
			icon: BookOpen,
			onClick: () => startImport("read"),
			disabled: isImporting,
			loading: isReading,
		};
		secondary = [
			{
				label: isAdding ? "Adding..." : "Add to library",
				icon: Plus,
				onClick: () => startImport("add"),
				disabled: isImporting,
				loading: isAdding,
			},
		];
	} else if (externalUrl) {
		primary = {
			label: `Read on ${sourceName}`,
			icon: ExternalLink,
			onClick: () => void Browser.open({ url: externalUrl }),
		};
	} else {
		primary = {
			label: "Not available as free EPUB",
			onClick: () => undefined,
			disabled: true,
		};
	}

	// The author shelf spans every language; the results must too.
	const openAuthor = (author: string) =>
		router.navigate({ to: "/tabs/explore", search: { author, lang: "all" } });

	return (
		<DetailShell
			backHref="/tabs/explore"
			cover={getCoverUrl(book.id, book.coverUrl)}
			eyebrow={isStandardEbooks ? sourceName : undefined}
			title={book.title}
			author={book.author}
			onAuthorTap={book.author ? () => openAuthor(book.author ?? "") : undefined}
			facts={catalogFacts(book, wpm)}
			subjects={book.subjects ?? undefined}
			tagLinks={
				book.tags && {
					tags: book.tags,
					onTap: (tagId) => router.navigate({ to: "/tabs/explore", search: { tags: tagId } }),
				}
			}
			primaryAction={primary}
			secondaryActions={secondary}
			description={{ html: book.description, text: book.summary }}
			externalLink={externalUrl ? { href: externalUrl } : undefined}
			progress={isImporting ? importer.progress : undefined}
			headerActions={[{ label: "Share", icon: Share2, onClick: () => void shareCatalogBook(book) }]}
		>
			<BookDetailShelves
				book={book}
				onOpen={(r) =>
					router.navigate({ to: "/tabs/explore/book/$catalogId", params: { catalogId: r.id } })
				}
				onSeeAuthor={openAuthor}
			/>
		</DetailShell>
	);
};

export default ExploreBookDetail;
