import { Button } from "@lesefluss/ui/button";
import { useQuery } from "@tanstack/react-query";
import type React from "react";
import { CloudflareChallenge } from "../../components/cloudflare-challenge";
import { type CatalogSearchResult, searchCatalog } from "../../services/catalog/client";
import { catalogKeys } from "../../services/catalog/query-keys";
import { queryHooks } from "../../services/db/hooks";
import { type ProviderId, providerLabel, type SearchResult } from "../../services/serial-scrapers";
import { EmptyState, ErrorState } from "../_shared/load-states";
import Shelf from "./shelf";
import ShelfFrame, { SHELF_ITEM_STYLE } from "./shelf-frame";
import { ShelfSkeleton } from "./skeletons";
import { WebNovelCard } from "./web-novel-card";

const CATALOG_PREVIEW_SIZE = 8;
const PROVIDER_PREVIEW_SIZE = 8;
const PREVIEW_STALE_TIME_MS = 5 * 60 * 1000;

type Props = {
	q: string;
	lang: string;
	onOpenBook: (result: CatalogSearchResult) => void;
	onOpenWebNovel: (result: SearchResult) => void;
	onSeeAllCatalog: () => void;
	onSeeAllProvider: (provider: ProviderId) => void;
	onSearchSuggestion: (suggestion: string) => void;
	onSearchAllLanguages?: () => void;
};

function groupByProvider(results: SearchResult[]): [ProviderId, SearchResult[]][] {
	const groups = new Map<ProviderId, SearchResult[]>();
	for (const r of results) groups.set(r.provider, [...(groups.get(r.provider) ?? []), r]);
	return [...groups];
}

/**
 * One query across every source, one section per source. The catalog and the
 * provider fan-out are separate queries, so a slow provider never holds back
 * catalog results; a failed provider is reported inline under its own name.
 */
const GroupedResults: React.FC<Props> = ({
	q,
	lang,
	onOpenBook,
	onOpenWebNovel,
	onSeeAllCatalog,
	onSeeAllProvider,
	onSearchSuggestion,
	onSearchAllLanguages,
}) => {
	const previewParams = { q, lang, limit: CATALOG_PREVIEW_SIZE };
	const catalog = useQuery({
		queryKey: catalogKeys.searchPreview(previewParams),
		queryFn: ({ signal }) => searchCatalog({ ...previewParams, sort: "relevance", signal }),
		staleTime: PREVIEW_STALE_TIME_MS,
	});
	// The query is already debounced by the URL, so skip the hook's own debounce.
	const serials = queryHooks.useSearchSerials(q, { debounceMs: 0 });

	const catalogResults = catalog.data?.results ?? [];
	const groups = groupByProvider(serials.data?.results ?? []);
	const failed = serials.data?.failedProviders ?? [];
	const challenged = serials.data?.challengeProviders ?? [];
	const isSerialsLoading = serials.isLoading || serials.isFetching;

	const suggestion = catalog.data?.suggestion;
	const isEverythingEmpty =
		catalog.isSuccess && catalogResults.length === 0 && serials.isSuccess && groups.length === 0;

	return (
		<div className="mx-auto max-w-5xl px-4 pt-4 pb-20">
			{catalog.isPending ? (
				<ShelfSkeleton />
			) : catalog.isError ? (
				<section className="mb-6">
					<h2 className="m-0 mb-2 font-semibold text-[0.95rem]">Public domain</h2>
					<ErrorState error={catalog.error} onRetry={() => catalog.refetch()} className="p-4" />
				</section>
			) : catalogResults.length > 0 ? (
				<Shelf
					title={`Public domain (${catalog.data.total.toLocaleString()})`}
					books={catalogResults}
					onOpen={onOpenBook}
					onSeeAll={onSeeAllCatalog}
				/>
			) : null}

			{challenged.length > 0 && (
				<div className="mb-4">
					<CloudflareChallenge providers={challenged} onResolved={() => serials.refetch()} />
				</div>
			)}

			{groups.map(([provider, results]) => (
				<ShelfFrame
					key={provider}
					title={providerLabel(provider)}
					onSeeAll={() => onSeeAllProvider(provider)}
					testId={`provider-group-${provider}`}
				>
					{results.slice(0, PROVIDER_PREVIEW_SIZE).map((r) => (
						<div key={r.sourceUrl} className="shrink-0" style={SHELF_ITEM_STYLE}>
							<WebNovelCard result={r} onPick={onOpenWebNovel} />
						</div>
					))}
				</ShelfFrame>
			))}

			{isSerialsLoading && <ShelfSkeleton />}

			{failed.length > 0 && !isSerialsLoading && (
				<div
					role="status"
					className="mb-4 flex items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-700 text-xs dark:text-amber-300"
				>
					<span>{failed.map(providerLabel).join(", ")} didn't respond.</span>
					<Button variant="ghost" size="sm" onClick={() => serials.refetch()}>
						Retry
					</Button>
				</div>
			)}
			{serials.isError && (
				<ErrorState error={serials.error} onRetry={() => serials.refetch()} className="p-4" />
			)}

			{isEverythingEmpty && (
				<div className="flex flex-col items-center gap-2">
					<EmptyState>Nothing found for "{q}".</EmptyState>
					<div className="flex flex-wrap justify-center gap-2">
						{suggestion && (
							<Button variant="outline" size="sm" onClick={() => onSearchSuggestion(suggestion)}>
								Search for "{suggestion}"
							</Button>
						)}
						{onSearchAllLanguages && (
							<Button variant="outline" size="sm" onClick={onSearchAllLanguages}>
								Search all languages
							</Button>
						)}
					</div>
				</div>
			)}
		</div>
	);
};

export default GroupedResults;
