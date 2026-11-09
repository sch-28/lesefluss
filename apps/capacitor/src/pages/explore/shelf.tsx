import { Button } from "@lesefluss/ui/button";
import { Shuffle } from "lucide-react";
import type React from "react";
import { useState } from "react";
import type { CatalogSearchResult } from "../../services/catalog/client";
import { ErrorState } from "../_shared/load-states";
import CatalogResultCard from "./catalog-result-card";
import ShelfFrame, { SHELF_ITEM_STYLE } from "./shelf-frame";
import { ShelfStripSkeleton } from "./skeletons";

type Props = {
	title: string;
	books: CatalogSearchResult[];
	onOpen: (result: CatalogSearchResult) => void;
	/** Opens the full list elsewhere; without it See all unrolls the shelf in place. */
	onSeeAll?: () => void;
	onShuffle?: () => void;
	isShuffling?: boolean;
	isLoading?: boolean;
	error?: unknown;
	onRetry?: () => void;
	emptyLabel?: string;
};

const Shelf: React.FC<Props> = ({
	title,
	books,
	onOpen,
	onSeeAll,
	onShuffle,
	isShuffling,
	isLoading,
	error,
	onRetry,
	emptyLabel,
}) => {
	const [isExpanded, setExpanded] = useState(false);
	const body = isLoading ? (
		<ShelfStripSkeleton />
	) : error ? (
		<ErrorState error={error} onRetry={onRetry} className="p-4" />
	) : books.length === 0 ? (
		// Holds the strip's height: a shelf that loads empty must not pull the page up.
		<div className="grid">
			<div className="[grid-area:1/1]">
				<ShelfStripSkeleton isSpacer />
			</div>
			<p className="m-0 self-center text-[0.8rem] text-muted-foreground [grid-area:1/1]">
				{emptyLabel ?? "Nothing here yet."}
			</p>
		</div>
	) : undefined;

	return (
		<ShelfFrame
			title={title}
			onSeeAll={onSeeAll ?? (body ? undefined : () => setExpanded(!isExpanded))}
			isExpanded={onSeeAll ? undefined : isExpanded}
			body={body}
			actions={
				onShuffle && (
					<Button
						variant="ghost"
						size="icon-sm"
						onClick={onShuffle}
						disabled={isShuffling}
						aria-label="Shuffle"
					>
						<Shuffle />
					</Button>
				)
			}
		>
			{books.map((b) => (
				<li key={b.id} className="shrink-0" style={isExpanded ? undefined : SHELF_ITEM_STYLE}>
					<CatalogResultCard result={b} onOpen={() => onOpen(b)} />
				</li>
			))}
		</ShelfFrame>
	);
};

export default Shelf;
