import type { SpeedModel } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { Share2 } from "lucide-react";
import { useState } from "react";
import { ShareCardSheet } from "../../../../components/share-card/share-card-sheet";
import { queryHooks } from "../../../../services/db/hooks";
import { speedCardData } from "../../../../services/share-card/card-data";
import type { ShareCardData } from "../../../../services/share-card/render";
import type { SpeedView } from "../../../../services/stats/speed-tab";
import { trendDelta } from "../../../../services/stats/speed-tab";

function startOfYear(now: number): number {
	return new Date(new Date(now).getFullYear(), 0, 1).getTime();
}

export function ShareSpeedButton({
	model,
	view,
	now,
}: {
	model: SpeedModel;
	view: SpeedView;
	now: number;
}) {
	const [card, setCard] = useState<ShareCardData | null>(null);
	const trend = queryHooks.useStatsWpmTrend(model.window, view, now);
	const year = queryHooks.useStatsPeriodTotals(startOfYear(now), now);
	const tab = queryHooks.useStatsSpeedTab();

	const open = () => {
		const points = (trend.data?.measured ?? []).filter((p) => p.avgWpm > 0).map((p) => p.avgWpm);
		setCard(
			speedCardData({
				model,
				trend: points,
				trendDeltaWpm: trend.data ? (trendDelta(trend.data)?.wpm ?? null) : null,
				year: year.data ?? { minutes: 0, words: 0, booksFinished: 0 },
				covers: (tab.data?.books ?? []).flatMap((b) => (b.coverImage ? [b.coverImage] : [])),
				now,
			}),
		);
	};

	return (
		<>
			<Button variant="ghost" size="sm" onClick={open} data-testid="share-speed-card">
				<Share2 />
				Share speed card
			</Button>
			{card && (
				<ShareCardSheet card={card} filename="lesefluss-speed" onClose={() => setCard(null)} />
			)}
		</>
	);
}
