import { Button } from "@lesefluss/ui/button";
import { Check, Minus, Plus } from "lucide-react";
import { queryHooks } from "../../services/db/hooks";
import {
	COMPARISON_BOOK_WORDS,
	DIAL_RANGE,
	fasterPercent,
	minutesFor,
	stepDial,
} from "../../services/stats/speed-test";
import { estimateMinutesLeft, minutesLabel } from "../../utils/reading-time";
import { SpeedGauge } from "./gauge";
import { Stat } from "./stat";

interface Props {
	readingWpm: number;
	rsvpWpm: number | null;
	dial: number;
	appliedDial: number | null;
	onDialChange: (dial: number) => void;
	onApply: () => void;
}

/** What the comparison card times: the rest of the current book, or a 300-page one. */
function useComparisonBook(): { label: string; minutesAt: (wpm: number) => number } {
	const lastReadId = queryHooks.useLastReadBookId().data ?? "";
	const book = queryHooks.useBook(lastReadId).data;
	if (book && estimateMinutesLeft(book, 1) !== null) {
		return {
			label: book.title,
			minutesAt: (wpm) => estimateMinutesLeft(book, wpm) ?? 0,
		};
	}
	return {
		label: "300-page book",
		minutesAt: (wpm) => minutesFor(COMPARISON_BOOK_WORDS, wpm),
	};
}

export function SpeedTestResult({
	readingWpm,
	rsvpWpm,
	dial,
	appliedDial,
	onDialChange,
	onApply,
}: Props) {
	const book = useComparisonBook();
	const readingMinutes = book.minutesAt(readingWpm);
	const rsvpMinutes = rsvpWpm === null ? null : book.minutesAt(rsvpWpm);
	const saved = rsvpMinutes === null ? 0 : readingMinutes - rsvpMinutes;
	const faster = rsvpWpm === null ? 0 : fasterPercent(readingWpm, rsvpWpm);
	const applied = appliedDial === dial;

	return (
		<div data-testid="speed-test-result">
			<SpeedGauge reading={readingWpm} dial={dial} value={String(readingWpm)} label="wpm read" />
			<dl className="mt-4 grid grid-cols-3 gap-2 text-center">
				<Stat label="Reading wpm" value={String(readingWpm)} />
				<Stat label="RSVP wpm" value={rsvpWpm === null ? "–" : String(rsvpWpm)} />
				<Stat label="Faster" value={faster > 0 ? `${faster}%` : "–"} />
			</dl>

			<div className="mt-4 rounded-lg border border-border p-3" data-testid="speed-test-book">
				<div className="truncate text-[11px] text-muted-foreground uppercase tracking-wider">
					{book.label}
				</div>
				<dl className="mt-2 grid grid-cols-3 gap-2 text-center">
					<div>
						<dt className="text-muted-foreground text-xs">Reading</dt>
						<dd className="font-semibold tabular-nums">{minutesLabel(readingMinutes)}</dd>
					</div>
					<div>
						<dt className="text-muted-foreground text-xs">RSVP</dt>
						<dd className="font-semibold tabular-nums">
							{rsvpMinutes === null ? "–" : minutesLabel(rsvpMinutes)}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground text-xs">Saved</dt>
						<dd className="font-semibold tabular-nums">{saved >= 1 ? minutesLabel(saved) : "–"}</dd>
					</div>
				</dl>
			</div>

			<div className="mt-4 flex items-center gap-2" data-testid="speed-test-dial">
				<Button
					variant="outline"
					size="icon"
					aria-label="Slower"
					disabled={dial <= DIAL_RANGE.min}
					onClick={() => onDialChange(stepDial(dial, -1))}
				>
					<Minus className="size-4" />
				</Button>
				<Button
					className="flex-1"
					variant={applied ? "secondary" : "outline"}
					onClick={onApply}
					disabled={applied}
				>
					{applied ? (
						<>
							<Check className="size-4" /> RSVP {dial} set
						</>
					) : (
						`Use RSVP ${dial}`
					)}
				</Button>
				<Button
					variant="outline"
					size="icon"
					aria-label="Faster"
					disabled={dial >= DIAL_RANGE.max}
					onClick={() => onDialChange(stepDial(dial, 1))}
				>
					<Plus className="size-4" />
				</Button>
			</div>
		</div>
	);
}
