import { Button } from "@lesefluss/ui/button";
import { Shuffle } from "lucide-react";
import type React from "react";
import type { CatalogSearchResult } from "../../services/catalog/client";
import { ErrorState } from "../_shared/load-states";
import CatalogResultCard from "./catalog-result-card";
import ShelfFrame, { SHELF_ITEM_STYLE } from "./shelf-frame";
import { ShelfStripSkeleton } from "./skeletons";

type Props = {
	title: string;
	books: CatalogSearchResult[];
	onOpen: (result: CatalogSearchResult) => void;
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
	const body = isLoading ? (
		<ShelfStripSkeleton />
	) : error ? (
		<ErrorState error={error} onRetry={onRetry} className="p-4" />
	) : books.length === 0 ? (
		<p className="m-0 text-[0.8rem] text-muted-foreground">{emptyLabel ?? "Nothing here yet."}</p>
	) : undefined;

	return (
		<ShelfFrame
			title={title}
			onSeeAll={onSeeAll}
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
				<div key={b.id} className="shrink-0" style={SHELF_ITEM_STYLE}>
					<CatalogResultCard result={b} onOpen={() => onOpen(b)} />
				</div>
			))}
		</ShelfFrame>
	);
};

export default Shelf;
