import { useQuery } from "@tanstack/react-query";
import type React from "react";
import { useMemo, useState } from "react";
import {
	type CatalogSearchResult,
	getLanding,
	getRandomShelf,
} from "../../services/catalog/client";
import { catalogKeys } from "../../services/catalog/query-keys";
import type { SearchResult } from "../../services/serial-scrapers";
import { ErrorState } from "../_shared/load-states";
import BrowseRow from "./browse-row";
import type { ExploreSearch } from "./explore-search";
import Hero from "./hero";
import Shelf from "./shelf";
import { HeroSkeleton, ShelfSkeleton } from "./skeletons";
import TrendingWebNovels from "./trending-web-novels";
import WebNovelsSection from "./web-novels-section";

const HERO_SIZE = 6;
const LANDING_STALE_TIME_MS = 10 * 60 * 1000;

/** The server reports a failed shelf by name; this shelf renders its own error. */
const SHELF_FAILED = new Error("Shelf failed to load");

type Props = {
	lang: string;
	onOpen: (result: CatalogSearchResult) => void;
	onOpenWebNovel: (result: SearchResult) => void;
	/** Opens results for a shelf's "See all". */
	onBrowse: (search: ExploreSearch) => void;
	onBrowseTags: () => void;
	/** Shelves that know the reader, placed right under the hero. */
	personalShelves?: React.ReactNode;
};

const ExploreLanding: React.FC<Props> = ({
	lang,
	onOpen,
	onOpenWebNovel,
	onBrowse,
	onBrowseTags,
	personalShelves,
}) => {
	const [shuffleNonce, setShuffleNonce] = useState(0);

	const landingQuery = useQuery({
		queryKey: catalogKeys.landing(lang),
		queryFn: ({ signal }) => getLanding(lang, signal),
		staleTime: LANDING_STALE_TIME_MS,
	});
	const randomQuery = useQuery({
		queryKey: catalogKeys.randomShelf(lang, "se", shuffleNonce),
		queryFn: ({ signal }) => getRandomShelf({ count: 8, lang, source: "se" }, signal),
	});

	const data = landingQuery.data;
	const failed = new Set(data?.failed ?? []);
	const retryLanding = () => landingQuery.refetch();
	const catalogShelf = (
		key: string,
		title: string,
		books: CatalogSearchResult[] | undefined,
		seeAll: ExploreSearch,
	) => (
		<Shelf
			key={key}
			title={title}
			books={books ?? []}
			onOpen={onOpen}
			onSeeAll={() => onBrowse(seeAll)}
			error={failed.has(key) ? SHELF_FAILED : undefined}
			isLoading={failed.has(key) && landingQuery.isFetching}
			onRetry={retryLanding}
		/>
	);

	const heroBooks = useMemo(
		() =>
			data ? (data.classics.length > 0 ? data.classics : data.featured_se).slice(0, HERO_SIZE) : [],
		[data],
	);

	return (
		<div className="mx-auto max-w-5xl px-4 pt-4 pb-20">
			<BrowseRow
				lang={lang}
				onGenreTap={(genre) => onBrowse({ genre })}
				onBrowseTags={onBrowseTags}
			/>

			{landingQuery.isPending ? (
				<>
					<HeroSkeleton />
					<ShelfSkeleton />
					<ShelfSkeleton />
				</>
			) : landingQuery.isError && !data ? (
				<ErrorState error={landingQuery.error} onRetry={retryLanding} className="mb-6" />
			) : (
				heroBooks.length > 0 && <Hero books={heroBooks} onOpen={onOpen} />
			)}

			{personalShelves}

			{/* Web novels stay together and high; each half loads and fails on its own. */}
			<TrendingWebNovels onOpen={onOpenWebNovel} />
			<WebNovelsSection />

			{data && (
				<>
					{data.recently_added &&
						catalogShelf("recently_added", "Recently added", data.recently_added, {
							scope: "catalog",
							sort: "recent",
						})}
					{catalogShelf("most_read", "Most read", data.most_read, {
						scope: "catalog",
						sort: "popular",
					})}
					{catalogShelf("featured_se", "New from Standard Ebooks", data.featured_se, {
						source: "standard_ebooks",
						sort: "recent",
					})}
					{data.genres.map((g) => catalogShelf(`genre:${g.id}`, g.label, g.books, { genre: g.id }))}
				</>
			)}

			<Shelf
				title="Random picks"
				books={randomQuery.data?.results ?? []}
				onOpen={onOpen}
				onSeeAll={() => onBrowse({ source: "standard_ebooks" })}
				onShuffle={() => setShuffleNonce((n) => n + 1)}
				isShuffling={randomQuery.isFetching}
				isLoading={randomQuery.isPending}
				error={randomQuery.isError ? randomQuery.error : undefined}
				onRetry={() => randomQuery.refetch()}
			/>
		</div>
	);
};

export default ExploreLanding;
