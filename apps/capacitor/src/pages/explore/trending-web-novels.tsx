import { useRouter } from "@tanstack/react-router";
import type React from "react";
import { queryHooks } from "../../services/db/hooks";
import type { SearchResult } from "../../services/serial-scrapers";
import { ErrorState } from "../_shared/load-states";
import ShelfFrame, { SHELF_ITEM_STYLE } from "./shelf-frame";
import { ShelfStripSkeleton } from "./skeletons";
import { WebNovelCard } from "./web-novel-card";

const TRENDING_SIZE = 12;

type Props = { onOpen: (result: SearchResult) => void };

/** Real series from the providers' popular lists; hidden if every provider came back empty. */
const TrendingWebNovels: React.FC<Props> = ({ onOpen }) => {
	const router = useRouter();
	const popular = queryHooks.usePopularSerials();
	const results = popular.data?.results.slice(0, TRENDING_SIZE) ?? [];
	if (popular.isSuccess && results.length === 0) return null;

	const body = popular.isPending ? (
		<ShelfStripSkeleton />
	) : popular.isError ? (
		<ErrorState error={popular.error} onRetry={() => popular.refetch()} className="p-4" />
	) : undefined;

	return (
		<ShelfFrame
			title="Trending web novels"
			onSeeAll={() => router.navigate({ to: "/tabs/explore/web-novels" })}
			body={body}
			testId="trending-web-novels"
		>
			{results.map((r) => (
				<div key={r.sourceUrl} className="shrink-0" style={SHELF_ITEM_STYLE}>
					<WebNovelCard result={r} onPick={onOpen} showProvider />
				</div>
			))}
		</ShelfFrame>
	);
};

export default TrendingWebNovels;
