import { FilterChip } from "@lesefluss/ui/filter-chip";
import { Tag } from "lucide-react";
import type React from "react";
import { useRef } from "react";
import { StripArrows } from "./strip-arrows";
import {
	HIDDEN_SCROLLBAR_X,
	useHasFinePointer,
	useStripEdges,
	useStripScroll,
} from "./strip-scroll";
import { useCatalogGenres } from "./use-catalog-genres";

type Props = {
	lang: string;
	onGenreTap: (genreId: string) => void;
	onBrowseTags: () => void;
};

/** Ways into the catalog, first thing on the landing. Hidden genres never block the tag entry. */
const BrowseRow: React.FC<Props> = ({ lang, onGenreTap, onBrowseTags }) => {
	const genres = useCatalogGenres(lang);
	const withBooks = (genres.data?.genres ?? []).filter((g) => g.count > 0);
	const stripRef = useRef<HTMLElement>(null);
	const hasFinePointer = useHasFinePointer();
	const scroll = useStripScroll(stripRef);
	const edges = useStripEdges(stripRef, hasFinePointer);

	const row = (
		<nav
			ref={stripRef}
			aria-label="Browse"
			className={
				hasFinePointer
					? `flex min-w-0 flex-1 items-center gap-2 pb-1 ${HIDDEN_SCROLLBAR_X}`
					: `-mx-4 -mt-2 mb-5 flex items-center gap-2 px-4 py-2 ${HIDDEN_SCROLLBAR_X}`
			}
		>
			<FilterChip selected={false} action onClick={onBrowseTags}>
				<Tag className="size-4" />
				Browse by tag
			</FilterChip>
			{withBooks.map((g) => (
				<FilterChip key={g.id} selected={false} action onClick={() => onGenreTap(g.id)}>
					{g.label}
				</FilterChip>
			))}
		</nav>
	);
	if (!hasFinePointer) return row;

	// A mouse has no swipe, so it gets the shelves' arrows, together at the right like theirs.
	return (
		<div className="mb-6 flex items-start gap-2">
			{row}
			{edges.overflows && <StripArrows label="genres" edges={edges} onScroll={scroll} />}
		</div>
	);
};

export default BrowseRow;
