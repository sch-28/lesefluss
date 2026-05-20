import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type React from "react";
import { useState } from "react";
import {
	type CatalogSearchResult,
	getLanding,
	getRandomShelf,
} from "../../services/catalog/client";
import { catalogKeys } from "../../services/catalog/query-keys";
import Hero from "./hero";
import Shelf from "./shelf";
import WebNovelsSection from "./web-novels-section";

type Props = {
	lang: string;
	onOpen: (result: CatalogSearchResult) => void;
	onGenreTap: (genreId: string) => void;
};

const ExploreLanding: React.FC<Props> = ({ lang, onOpen, onGenreTap }) => {
	const [shuffleNonce, setShuffleNonce] = useState(0);

	const landingQuery = useQuery({
		queryKey: catalogKeys.landing(lang),
		queryFn: ({ signal }) => getLanding(lang, signal),
	});

	const randomQuery = useQuery({
		queryKey: catalogKeys.randomShelf(lang, "se", shuffleNonce),
		queryFn: ({ signal }) => getRandomShelf({ count: 8, lang, source: "se" }, signal),
	});

	if (landingQuery.isPending) {
		return (
			<div className="flex min-h-[60vh] items-center justify-center p-8">
				<Loader2 className="size-6 animate-spin text-muted-foreground" />
			</div>
		);
	}
	if (landingQuery.isError) {
		return (
			<div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
				<p className="m-0 text-muted-foreground">
					{landingQuery.error instanceof Error
						? landingQuery.error.message
						: "Failed to load catalog."}
				</p>
			</div>
		);
	}

	const data = landingQuery.data;
	// Prefer curated classics for the hero; fall back to featured SE.
	const heroBooks =
		data.classics.length > 0 ? data.classics.slice(0, 6) : data.featured_se.slice(0, 6);

	return (
		<div className="mx-auto max-w-5xl p-4 pb-20">
			{heroBooks.length > 0 && <Hero books={heroBooks} onOpen={onOpen} />}

			<WebNovelsSection />

			{data.featured_se.length > 0 && (
				<Shelf title="Featured" books={data.featured_se} onOpen={onOpen} />
			)}
			{data.classics.length > 0 && (
				<Shelf title="Classics" books={data.classics} onOpen={onOpen} />
			)}
			{data.most_read.length > 0 && (
				<Shelf title="Most read" books={data.most_read} onOpen={onOpen} />
			)}
			<Shelf
				title="Random picks"
				books={randomQuery.data?.results ?? []}
				onOpen={onOpen}
				onShuffle={() => setShuffleNonce((n) => n + 1)}
				isShuffling={randomQuery.isFetching}
				emptyLabel={randomQuery.isPending ? "Loading..." : "Nothing here yet."}
			/>
			{data.genres.map((g) => (
				<Shelf
					key={g.id}
					title={g.label}
					books={g.books}
					onOpen={onOpen}
					onSeeAll={() => onGenreTap(g.id)}
				/>
			))}

			<section className="pt-4">
				<h2 className="mb-3 font-semibold text-[0.95rem]">Browse genres</h2>
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
					{data.genres.map((g) => (
						<button
							type="button"
							key={g.id}
							className="rounded-lg border border-border bg-card px-3 py-3 text-left font-medium text-foreground text-sm transition-colors hover:bg-muted"
							onClick={() => onGenreTap(g.id)}
						>
							{g.label}
						</button>
					))}
				</div>
			</section>
		</div>
	);
};

export default ExploreLanding;
