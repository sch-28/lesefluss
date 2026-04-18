import { IonButton, IonIcon } from "@ionic/react";
import { chevronForwardOutline, shuffleOutline } from "ionicons/icons";
import type React from "react";
import type { CatalogSearchResult } from "../../services/catalog/client";
import ResultCard from "./result-card";

type Props = {
	title: string;
	books: CatalogSearchResult[];
	onOpen: (result: CatalogSearchResult) => void;
	onSeeAll?: () => void;
	onShuffle?: () => void;
	isShuffling?: boolean;
	emptyLabel?: string;
};

/**
 * Horizontal-scroll strip of catalog cards. CSS `overflow-x:auto` +
 * `scroll-snap-type: x mandatory` gives each card a crisp snap target on
 * touch devices without any JS.
 */
const Shelf: React.FC<Props> = ({
	title,
	books,
	onOpen,
	onSeeAll,
	onShuffle,
	isShuffling,
	emptyLabel,
}) => {
	return (
		<section className="explore-shelf mb-6">
			<header className="mb-2 flex items-center justify-between">
				<h2 className="m-0 font-semibold text-[0.95rem]">{title}</h2>
				<div className="flex items-center gap-1">
					{onShuffle && (
						<IonButton
							fill="clear"
							size="small"
							onClick={onShuffle}
							disabled={isShuffling}
							aria-label="Shuffle"
						>
							<IonIcon slot="icon-only" icon={shuffleOutline} />
						</IonButton>
					)}
					{onSeeAll && (
						<IonButton fill="clear" size="small" onClick={onSeeAll}>
							See all
							<IonIcon slot="end" icon={chevronForwardOutline} />
						</IonButton>
					)}
				</div>
			</header>
			{books.length === 0 ? (
				<p className="text-[#888] text-[0.8rem]" style={{ margin: 0 }}>
					{emptyLabel ?? "Nothing here yet."}
				</p>
			) : (
				<div className="explore-shelf-scroll flex gap-3 overflow-x-auto pb-2">
					{books.map((b) => (
						<div
							key={b.id}
							className="shrink-0"
							style={{ width: "7.5rem", scrollSnapAlign: "start" }}
						>
							<ResultCard result={b} onOpen={() => onOpen(b)} />
						</div>
					))}
				</div>
			)}
		</section>
	);
};

export default Shelf;
