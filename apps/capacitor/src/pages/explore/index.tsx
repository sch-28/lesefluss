import { cn } from "@lesefluss/ui/utils";
import { useRouter } from "@tanstack/react-router";
import { Compass } from "lucide-react";
import type React from "react";
import { useEffect } from "react";
import { PageToolbar, TOOLBAR_ROW } from "@/components/page-body";
import { PageContainer } from "@/components/page-container";
import { TabHeader } from "../../components/app-shell/tab-header";
import { ViewModeToggle } from "../../components/view-mode-toggle";
import { CATALOG_ENABLED, type CatalogSearchResult } from "../../services/catalog/client";
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
import PersonalShelves, { usePersonalShelvesPending } from "./personal-shelves";
import { previewCache } from "./preview-cache";
import { recordRecentSearch } from "./recent-searches";
import SearchField from "./search-field";
import { CardGridSkeleton } from "./skeletons";
import { tagLabel } from "./tag-labels";
import { useCatalogGenres } from "./use-catalog-genres";
import { useCatalogSearch } from "./use-catalog-search";
import { storeLang, useCatalogLanguages, useExploreLang } from "./use-explore-lang";
import { useQueryText } from "./use-query-text";
import { useReadingSpeed } from "./use-reading-speed";
import WishlistShelf from "./wishlist-shelf";

type Props = { search: ExploreSearch };

const Explore: React.FC<Props> = ({ search }) => {
	const router = useRouter();
	const lang = useExploreLang(search.lang);
	const speed = useReadingSpeed();
	const mode = exploreMode(search);
	const isPersonalPending = usePersonalShelvesPending();
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

	const genresQuery = useCatalogGenres(lang ?? "en", mode === "catalog" && lang !== undefined);
	const languagesQuery = useCatalogLanguages(mode === "catalog");

	const filters = toCatalogFilters(search, lang ?? "en", speed.wpm);
	// A length or fits filter's word bounds depend on the speed; searching before
	// it loads would run once at the fallback and again at the measured value.
	const isSpeedReady = (!search.length && !search.fits) || speed.isSettled;
	const isSearchReady = mode === "catalog" && lang !== undefined && isSpeedReady;
	const catalogSearch = useCatalogSearch(filters, isSearchReady);
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
		? () =>
				patch({
					genre: undefined,
					tags: undefined,
					source: undefined,
					length: undefined,
					fits: undefined,
				})
		: undefined;
	const tagLabels = new Map(parseTags(search.tags).map((id) => [id, tagLabel(id)]));

	return (
		<div className="bg-background">
			<TabHeader
				width="grid"
				icon={Compass}
				title="Explore"
				right={
					mode === "catalog" && (
						<ViewModeToggle
							viewMode={view}
							onToggle={() => patch({ view: view === "grid" ? "list" : undefined })}
						/>
					)
				}
			/>
			{/* Sticky, so search and filters stay in reach on a long list. The landing's
			    browse row carries on the toolbar's rows below it, out of the sticky band. */}
			<PageToolbar sticky className={cn(mode === "landing" && "pb-0")}>
				<PageContainer width="grid" className={cn("px-4", TOOLBAR_ROW)}>
					<SearchField
						value={queryText.text}
						onChange={queryText.setText}
						onSubmit={queryText.submit}
					/>
				</PageContainer>
				{mode === "catalog" && lang !== undefined && (
					<PageContainer width="grid">
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
					</PageContainer>
				)}
			</PageToolbar>

			{lang === undefined ? (
				<CardGridSkeleton
					count={12}
					// The landing toolbar drops its bottom padding; its row's py-1 plus pt-2 is the 12.
					className={cn("px-4 pb-4", mode === "landing" && "pt-2")}
				/>
			) : mode === "landing" ? (
				<ExploreLanding
					lang={lang}
					onOpen={openBook}
					onOpenWebNovel={openWebNovel}
					onBrowse={(next) => update(() => withSearch({ lang: search.lang }, next))}
					onBrowseTags={browseTags}
					isPersonalPending={isPersonalPending}
					personalShelves={
						<>
							<WishlistShelf />
							<PersonalShelves
								onOpen={openBook}
								onBrowse={(next) => update(() => withSearch({ lang: search.lang }, next))}
							/>
						</>
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
				<PageContainer width="grid">
					<CatalogResults
						filters={filters}
						enabled={isSpeedReady}
						view={view}
						onOpen={openBook}
						onSearchSuggestion={queryText.submit}
						onClearFilters={clearFilters}
						hasQuery={!!search.q}
						onSearchAllLanguages={searchAllLanguages}
					/>
				</PageContainer>
			)}
		</div>
	);
};

export default Explore;
