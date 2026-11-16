import { bookPace, estimateMinutes } from "@lesefluss/core";
import { Popover, PopoverContent, PopoverTrigger } from "@lesefluss/ui/popover";
import { Info } from "lucide-react";
import { queryHooks } from "../../services/db/hooks";
import { type SeriesChapterLength, seriesReadingTime } from "../../services/stats/what-if";
import { formatReadingTime } from "../../utils/reading-time";

type SeriesTimes = { total: string; left: string | null; unknown: number; wpm: number };

/** A series' times at the reader's global pace; `left` only once started and not yet done. */
function useSeriesTimes(chapters: readonly SeriesChapterLength[] | undefined): SeriesTimes | null {
	const { data: model } = queryHooks.useStatsSpeedModel();
	if (!model || !chapters) return null;
	const { words, wordsLeft, unknown } = seriesReadingTime(chapters);
	if (words <= 0) return null;
	const wpm = bookPace(model, null).wpm;
	return {
		total: formatReadingTime(estimateMinutes(words, wpm)),
		left:
			wordsLeft > 0 && wordsLeft < words
				? formatReadingTime(estimateMinutes(wordsLeft, wpm))
				: null,
		unknown,
		wpm,
	};
}

/** "Left 8h" while the series is under way; nothing when unstarted or finished, as on book cards. */
export function SeriesCardTime({
	chapters,
	className,
}: {
	chapters: readonly SeriesChapterLength[] | undefined;
	className?: string;
}) {
	const left = useSeriesTimes(chapters)?.left;
	if (!left) return null;
	return (
		<span className={className} data-testid="series-card-time">
			Left {left}
		</span>
	);
}

/** "Total 12h 5m · Left 8h" for a series' hero line, at the reader's global pace. */
export function SeriesReadingTime({ chapters }: { chapters: readonly SeriesChapterLength[] }) {
	const times = useSeriesTimes(chapters);
	if (!times) return null;
	const { total, left, unknown, wpm } = times;

	return (
		<span
			className="inline-flex items-center gap-1.5 tabular-nums"
			data-testid="series-reading-time"
		>
			<span>· Total {total}</span>
			{left && <span>· Left {left}</span>}
			{unknown > 0 && (
				<Popover>
					<PopoverTrigger asChild>
						<button type="button" aria-label="About these times" className="inline-flex">
							<Info className="size-3.5" aria-hidden="true" />
						</button>
					</PopoverTrigger>
					<PopoverContent className="w-64 text-sm">
						At your pace of {wpm} wpm. {unknown === 1 ? "1 chapter is" : `${unknown} chapters are`}{" "}
						not downloaded yet and not counted.
					</PopoverContent>
				</Popover>
			)}
		</span>
	);
}
