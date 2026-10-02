import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Compass } from "lucide-react";
import type React from "react";
import { useEffect } from "react";
import { TabHeader } from "../../components/app-shell/tab-header";
import { ViewModeToggle } from "../../components/view-mode-toggle";
import {
	CATALOG_ENABLED,
	type CatalogSearchResult,
	getGenres,
} from "../../services/catalog/client";
import { catalogKeys } from "../../services/catalog/query-keys";
import type { ProviderId, SearchResult } from "../../services/serial-scrapers";
import CatalogResults from "./catalog-results";
import {
	addTag,
	type ExploreSearch,
	exploreMode,
	hasCatalogFilters,
	parseExploreSearch,
	parseTags,
	removeTag,
	toCatalogFilters,
	withSearch,
} from "./explore-search";
import FilterRow from "./filter-row";
import GroupedResults from "./grouped-results";
import ExploreLanding from "./landing";
import PersonalShelves from "./personal-shelves";
import { previewCache } from "./preview-cache";
import { recordRecentSearch } from "./recent-searches";
import SearchField from "./search-field";
import { CardGridSkeleton } from "./skeletons";
import { tagLabel } from "./tag-labels";
import { useCatalogSearch } from "./use-catalog-search";
import { storeLang, useCatalogLanguages, useExploreLang } from "./use-explore-lang";
import { useQueryText } from "./use-query-text";
import { useReaderWpm } from "./use-reader-wpm";

const GENRES_STALE_TIME_MS = 60 * 60 * 1000;

type Props = { search: ExploreSearch };

const Explore: React.FC<Props> = ({ search }) => {
	const router = useRouter();
	const lang = useExploreLang(search.lang);
	const wpm = useReaderWpm();
	const mode = exploreMode(search);
	const view = search.view ?? "grid";

	/**
	 * Builds from the router's current location, not the `search` captured at
	 * render, so two quick changes (a debounce landing right after a chip tap)
	 * don't overwrite each other. Switching between landing, grouped and
	 * catalog views pushes, so Android back returns to the previous view;
	 * tweaks within a view replace.
	 */
	const update = (change: (current: ExploreSearch) => ExploreSearch) => {
		const current = parseExploreSearch(router.state.location.search);
		const next = change(current);
		const isModeChange = exploreMode(current) !== exploreMode(next);
		return router.navigate({ to: "/tabs/explore", search: next, replace: !isModeChange });
	};
	const patch = (p: Partial<ExploreSearch>) => update((s) => withSearch(s, p));

	const queryText = useQueryText(search.q, (q) =>
		update((s) => withSearch(s, { q: q || undefined, scope: undefined })),
	);

	const genresQuery = useQuery({
		queryKey: catalogKeys.genres(lang ?? "en"),
		queryFn: ({ signal }) => getGenres(lang ?? "en", signal),
		enabled: mode === "catalog" && lang !== undefined,
		staleTime: GENRES_STALE_TIME_MS,
	});
	const languagesQuery = useCatalogLanguages(mode === "catalog");

	const filters = toCatalogFilters(search, lang ?? "en", wpm);
	const catalogSearch = useCatalogSearch(filters, mode === "catalog" && lang !== undefined);
	const firstPage = mode === "catalog" ? catalogSearch.data?.pages[0] : undefined;

	// The catalog drops tags and genres it doesn't know (a stale shared link)
	// and echoes what it applied; take the dead chips out of the URL to match.
	const appliedTags = firstPage?.tags;
	const appliedGenre = firstPage?.genre;
	// biome-ignore lint/correctness/useExhaustiveDependencies: reacts to what the server applied, nothing else.
	useEffect(() => {
		if (!appliedTags) return;
		const requested = parseTags(search.tags);
		const deadTags = requested.filter((t) => !appliedTags.includes(t));
		const isGenreDead = search.genre !== undefined && appliedGenre === null;
		if (deadTags.length === 0 && !isGenreDead) return;
		update((s) => {
			let next = deadTags.reduce(removeTag, s);
			if (isGenreDead) next = withSearch(next, { genre: undefined });
			return next;
		});
	}, [appliedTags, appliedGenre]);

	const recordQuery = () => {
		if (search.q) recordRecentSearch(search.q);
	};
	const openBook = (r: CatalogSearchResult) => {
		recordQuery();
		router.navigate({ to: "/tabs/explore/book/$catalogId", params: { catalogId: r.id } });
	};
	const openWebNovel = (r: SearchResult) => {
		recordQuery();
		previewCache.set(r);
		router.navigate({ to: "/tabs/explore/web-novel-preview", search: { url: r.sourceUrl } });
	};
	const changeLang = (next: string) => {
		storeLang(next);
		patch({ lang: next });
	};
	const browseTags = () => router.navigate({ to: "/tabs/explore/tags", search });

	if (!CATALOG_ENABLED) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background p-8">
				<p className="text-muted-foreground">
					Catalog is not configured (VITE_CATALOG_URL missing).
				</p>
			</div>
		);
	}

	const searchAllLanguages = lang !== "all" ? () => changeLang("all") : undefined;
	const clearFilters = hasCatalogFilters(search)
		? () => patch({ genre: undefined, tags: undefined, source: undefined, length: undefined })
		: undefined;
	const tagLabels = new Map(parseTags(search.tags).map((id) => [id, tagLabel(id)]));

	return (
		<div className="bg-background">
			<TabHeader>
				<Compass className="size-5 shrink-0 text-muted-foreground" />
				<h1 className="m-0 flex-1 font-semibold text-base leading-none">Explore</h1>
				{mode === "catalog" && (
					<ViewModeToggle
						viewMode={view}
						onToggle={() => patch({ view: view === "grid" ? "list" : undefined })}
					/>
				)}
			</TabHeader>
			{/* Sticks under the header (safe area + 48px row + 1px border) so search
			    and filters stay in reach on a long list. */}
			<div className="sticky top-[calc(var(--safe-top)+3rem+1px)] z-10 bg-background/95 pb-2 backdrop-blur">
				<div className="mx-auto max-w-5xl px-4 pt-3">
					<SearchField
						value={queryText.text}
						onChange={queryText.setText}
						onSubmit={queryText.submit}
					/>
				</div>
				{mode === "catalog" && lang !== undefined && (
					<div className="mx-auto max-w-5xl">
						<FilterRow
							search={search}
							lang={lang}
							genres={genresQuery.data?.genres}
							languages={languagesQuery.data?.languages}
							tagLabels={tagLabels}
							facets={firstPage?.facets?.tags}
							onChange={(p) => (p.lang ? changeLang(p.lang) : patch(p))}
							onAddTag={(id) => update((s) => addTag(s, id))}
							onRemoveTag={(id) => update((s) => removeTag(s, id))}
							onBrowseTags={browseTags}
						/>
					</div>
				)}
			</div>

			{lang === undefined ? (
				<CardGridSkeleton count={12} className="p-4" />
			) : mode === "landing" ? (
				<ExploreLanding
					lang={lang}
					onOpen={openBook}
					onOpenWebNovel={openWebNovel}
					onBrowse={(next) => update(() => withSearch({ lang: search.lang }, next))}
					onBrowseTags={browseTags}
					personalShelves={
						<PersonalShelves
							onOpen={openBook}
							onBrowse={(next) => update(() => withSearch({ lang: search.lang }, next))}
						/>
					}
				/>
			) : mode === "grouped" ? (
				<GroupedResults
					q={search.q ?? ""}
					lang={lang}
					onOpenBook={openBook}
					onOpenWebNovel={openWebNovel}
					onSeeAllCatalog={() => patch({ scope: "catalog" })}
					onSeeAllProvider={(provider: ProviderId) =>
						router.navigate({
							to: "/tabs/explore/web-novels",
							search: { provider, q: search.q },
						})
					}
					onSearchSuggestion={queryText.submit}
					onSearchAllLanguages={searchAllLanguages}
				/>
			) : (
				<div className="mx-auto max-w-5xl">
					<CatalogResults
						filters={filters}
						view={view}
						onOpen={openBook}
						onSearchSuggestion={queryText.submit}
						onClearFilters={clearFilters}
						hasQuery={!!search.q}
						onSearchAllLanguages={searchAllLanguages}
					/>
				</div>
			)}
		</div>
	);
};

export default Explore;
