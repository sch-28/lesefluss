import { Button } from "@lesefluss/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Tag } from "lucide-react";
import type React from "react";
import { getGenres } from "../../services/catalog/client";
import { catalogKeys } from "../../services/catalog/query-keys";

const GENRES_STALE_TIME_MS = 60 * 60 * 1000;

type Props = {
	lang: string;
	onGenreTap: (genreId: string) => void;
	onBrowseTags: () => void;
};

/** Ways into the catalog, first thing on the landing. Hidden genres never block the tag entry. */
const BrowseRow: React.FC<Props> = ({ lang, onGenreTap, onBrowseTags }) => {
	const genres = useQuery({
		queryKey: catalogKeys.genres(lang),
		queryFn: ({ signal }) => getGenres(lang, signal),
		staleTime: GENRES_STALE_TIME_MS,
	});
	const withBooks = (genres.data?.genres ?? []).filter((g) => g.count > 0);

	return (
		<nav aria-label="Browse" className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1">
			<Button variant="secondary" size="sm" className="shrink-0 gap-1" onClick={onBrowseTags}>
				<Tag className="size-3.5" />
				Browse by tag
			</Button>
			{withBooks.map((g) => (
				<Button
					key={g.id}
					variant="outline"
					size="sm"
					className="shrink-0"
					onClick={() => onGenreTap(g.id)}
				>
					{g.label}
				</Button>
			))}
		</nav>
	);
};

export default BrowseRow;
