import { Button } from "@lesefluss/ui/button";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Tag } from "lucide-react";
import type React from "react";
import { useRef } from "react";
import { getGenres } from "../../services/catalog/client";
import { catalogKeys } from "../../services/catalog/query-keys";
import { HIDDEN_SCROLLBAR_X } from "./shelf-frame";
import { useHasFinePointer, useStripScroll } from "./strip-scroll";

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
	const stripRef = useRef<HTMLElement>(null);
	const hasFinePointer = useHasFinePointer();
	const scroll = useStripScroll(stripRef);

	const row = (
		<nav
			ref={stripRef}
			aria-label="Browse"
			className={
				hasFinePointer
					? `flex min-w-0 flex-1 gap-2 pb-1 ${HIDDEN_SCROLLBAR_X}`
					: `-mx-4 mb-5 flex gap-2 px-4 pb-1 ${HIDDEN_SCROLLBAR_X}`
			}
		>
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
	if (!hasFinePointer) return row;

	// A mouse has no swipe, so it gets the shelves' arrows instead.
	return (
		<div className="mb-5 flex items-start gap-1">
			<Button
				variant="ghost"
				size="icon-sm"
				onClick={() => scroll(-1)}
				aria-label="Scroll genres left"
			>
				<ChevronLeft />
			</Button>
			{row}
			<Button
				variant="ghost"
				size="icon-sm"
				onClick={() => scroll(1)}
				aria-label="Scroll genres right"
			>
				<ChevronRight />
			</Button>
		</div>
	);
};

export default BrowseRow;
