import { bookPace, estimateMinutes } from "@lesefluss/core";
import { Popover, PopoverContent, PopoverTrigger } from "@lesefluss/ui/popover";
import { Info } from "lucide-react";
import { queryHooks } from "../../services/db/hooks";
import { type SeriesChapterLength, seriesReadingTime } from "../../services/stats/what-if";
import { formatReadingTime } from "../../utils/reading-time";

/** "Total 12h 5m · Left 8h" for a series' hero line, at the reader's global pace. */
export function SeriesReadingTime({ chapters }: { chapters: readonly SeriesChapterLength[] }) {
	const { data: model } = queryHooks.useStatsSpeedModel();
	if (!model) return null;
	const { words, wordsLeft, unknown } = seriesReadingTime(chapters);
	if (words <= 0) return null;
	const wpm = bookPace(model, null).wpm;

	return (
		<span
			className="inline-flex items-center gap-1.5 tabular-nums"
			data-testid="series-reading-time"
		>
			<span>· Total {formatReadingTime(estimateMinutes(words, wpm))}</span>
			{wordsLeft > 0 && wordsLeft < words && (
				<span>· Left {formatReadingTime(estimateMinutes(wordsLeft, wpm))}</span>
			)}
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
