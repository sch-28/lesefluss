import { IonSpinner, IonText } from "@ionic/react";
import { useQuery } from "@tanstack/react-query";
import type React from "react";
import { useState } from "react";
import {
	type CatalogSearchResult,
	getLanding,
	getRandomShelf,
} from "../../services/catalog/client";
import { catalogKeys } from "../../services/catalog/query-keys";
import Shelf from "./shelf";

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
			<div className="flex h-full items-center justify-center p-8">
				<IonSpinner />
			</div>
		);
	}
	if (landingQuery.isError) {
		return (
			<div className="flex h-full flex-col items-center justify-center p-8 text-center">
				<IonText color="medium">
					<p style={{ margin: 0 }}>
						{landingQuery.error instanceof Error
							? landingQuery.error.message
							: "Failed to load catalog."}
					</p>
				</IonText>
			</div>
		);
	}

	const data = landingQuery.data;

	return (
		<div className="pt-2 pb-8">
			{data.featured_se.length > 0 && (
				<Shelf title="Featured" books={data.featured_se} onOpen={onOpen} />
			)}
			{data.classics.length > 0 && <Shelf title="Classics" books={data.classics} onOpen={onOpen} />}
			{data.most_read.length > 0 && (
				<Shelf title="Most read" books={data.most_read} onOpen={onOpen} />
			)}
			<Shelf
				title="Random picks"
				books={randomQuery.data?.results ?? []}
				onOpen={onOpen}
				onShuffle={() => setShuffleNonce((n) => n + 1)}
				isShuffling={randomQuery.isFetching}
				emptyLabel={randomQuery.isPending ? "Loading…" : "Nothing here yet."}
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

			<section className="px-4 pt-4">
				<h2 className="mb-3 font-semibold text-[0.95rem]">Browse genres</h2>
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
					{data.genres.map((g) => (
						<button
							type="button"
							key={g.id}
							onClick={() => onGenreTap(g.id)}
							className="rounded-md border border-[#d9d9d9] bg-[#fafafa] px-3 py-4 text-left font-medium text-[0.85rem] active:opacity-70"
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
