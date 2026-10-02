import { Button } from "@lesefluss/ui/button";
import { Loader2 } from "lucide-react";
import type React from "react";
import { useEffect, useRef } from "react";
import type { ViewMode } from "../../components/view-mode-toggle";
import type { CatalogSearchResult } from "../../services/catalog/client";
import type { CatalogSearchFilters } from "../../services/catalog/query-keys";
import { EmptyState, ErrorState } from "../_shared/load-states";
import CatalogListItem from "./catalog-list-item";
import CatalogResultCard from "./catalog-result-card";
import { CardGridSkeleton, EXPLORE_GRID_CLASS } from "./skeletons";
import { useCatalogSearch } from "./use-catalog-search";

const SCROLL_CONTAINER = '[data-scroll-restoration-id="app-scroll"]';

type ZeroResultActions = {
	onSearchSuggestion: (suggestion: string) => void;
	onClearFilters?: () => void;
	onSearchAllLanguages?: () => void;
	/** A free-text query is set, so filters may be what hides its matches. */
	hasQuery?: boolean;
};

type Props = {
	filters: CatalogSearchFilters;
	view: ViewMode;
	onOpen: (result: CatalogSearchResult) => void;
} & ZeroResultActions;

function useSentinel(onVisible: () => void, isEnabled: boolean) {
	const ref = useRef<HTMLDivElement>(null);
	const callbackRef = useRef(onVisible);
	callbackRef.current = onVisible;
	useEffect(() => {
		const el = ref.current;
		if (!el || !isEnabled || typeof IntersectionObserver === "undefined") return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) callbackRef.current();
			},
			// The app scrolls this container, not the window; the margin only
			// applies against the root that actually scrolls.
			{ root: el.closest(SCROLL_CONTAINER), rootMargin: "600px 0px" },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [isEnabled]);
	return ref;
}

const ZeroResults: React.FC<ZeroResultActions & { suggestion?: string | null }> = ({
	suggestion,
	onSearchSuggestion,
	onClearFilters,
	onSearchAllLanguages,
	hasQuery,
}) => {
	// A new query typed while filters are still on is the common way to get here;
	// say so and make dropping them the obvious way out.
	const filtersHideQuery = hasQuery && !!onClearFilters;
	return (
		<div className="flex min-h-[50vh] flex-col items-center justify-center gap-2">
			<EmptyState>
				{filtersHideQuery
					? "No books match this search with the active filters."
					: "No books match."}
			</EmptyState>
			<div className="flex flex-wrap justify-center gap-2 px-4">
				{filtersHideQuery && (
					<Button size="sm" onClick={onClearFilters}>
						Search without filters
					</Button>
				)}
				{suggestion && (
					<Button variant="outline" size="sm" onClick={() => onSearchSuggestion(suggestion)}>
						Search for "{suggestion}"
					</Button>
				)}
				{onClearFilters && !filtersHideQuery && (
					<Button variant="outline" size="sm" onClick={onClearFilters}>
						Clear filters
					</Button>
				)}
				{onSearchAllLanguages && (
					<Button variant="outline" size="sm" onClick={onSearchAllLanguages}>
						Search all languages
					</Button>
				)}
			</div>
		</div>
	);
};

const CatalogResults: React.FC<Props> = ({
	filters,
	view,
	onOpen,
	onSearchSuggestion,
	onClearFilters,
	onSearchAllLanguages,
	hasQuery,
}) => {
	const query = useCatalogSearch(filters);

	const canLoadMore = query.hasNextPage && !query.isFetchingNextPage && !query.isError;
	const sentinelRef = useSentinel(() => {
		if (canLoadMore) void query.fetchNextPage();
	}, canLoadMore);

	if (query.isPending) {
		return <CardGridSkeleton count={12} layout={view} className="p-4" />;
	}
	if (query.isError && !query.data) {
		return (
			<ErrorState className="min-h-[50vh]" error={query.error} onRetry={() => query.refetch()} />
		);
	}

	const firstPage = query.data.pages[0];
	const results = query.data.pages.flatMap((p) => p.results);
	const total = firstPage?.total ?? 0;

	if (results.length === 0) {
		return (
			<ZeroResults
				suggestion={firstPage?.suggestion}
				onSearchSuggestion={onSearchSuggestion}
				onClearFilters={onClearFilters}
				onSearchAllLanguages={onSearchAllLanguages}
				hasQuery={hasQuery}
			/>
		);
	}

	return (
		<div className="pb-20">
			<div className="px-4 pt-2 text-muted-foreground text-xs">
				{total.toLocaleString()} result{total === 1 ? "" : "s"}
			</div>
			{view === "grid" ? (
				<div className={`${EXPLORE_GRID_CLASS} p-4`}>
					{results.map((r) => (
						<CatalogResultCard key={r.id} result={r} onOpen={() => onOpen(r)} />
					))}
				</div>
			) : (
				<div className="flex flex-col divide-y divide-border px-4 pt-2">
					{results.map((r) => (
						<CatalogListItem key={r.id} result={r} onOpen={() => onOpen(r)} />
					))}
				</div>
			)}
			<div ref={sentinelRef} data-testid="load-more-sentinel" />
			{query.isFetchingNextPage && (
				<div className="flex justify-center p-4">
					<Loader2 className="size-5 animate-spin text-muted-foreground" />
				</div>
			)}
			{query.isFetchNextPageError && (
				<ErrorState error={query.error} onRetry={() => query.fetchNextPage()} />
			)}
		</div>
	);
};

export default CatalogResults;
