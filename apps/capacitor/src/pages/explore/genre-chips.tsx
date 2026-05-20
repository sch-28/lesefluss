import { Button } from "@lesefluss/ui/button";
import { X } from "lucide-react";
import type React from "react";

type Props = {
	activeGenre: string | null;
	activeLabel?: string;
	onClear: () => void;
};

/**
 * Narrow row shown above the search results while a genre filter is active.
 * Tapping the × removes the filter and returns to landing (if there's no query).
 */
const GenreChips: React.FC<Props> = ({ activeGenre, activeLabel, onClear }) => {
	if (!activeGenre) return null;
	return (
		<div className="flex items-center gap-2 px-4 pt-2 pb-1">
			<Button variant="secondary" size="sm" onClick={onClear} className="gap-1">
				{activeLabel ?? activeGenre}
				<X className="size-3.5" />
			</Button>
		</div>
	);
};

export default GenreChips;
