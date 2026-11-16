import { Popover, PopoverContent, PopoverTrigger } from "@lesefluss/ui/popover";
import type React from "react";
import { formatReadingTime, WORDS_PER_PAGE } from "../../utils/reading-time";
import { type BookLength, describeLength } from "./length";
import { type ReadingSpeed, useRsvpWpm } from "./use-reading-speed";

type Props = {
	length: BookLength;
	speed: ReadingSpeed;
	/** Shown when the length is an estimate: what it rests on and when it becomes exact. */
	estimateNote?: string;
};

const CATALOG_ESTIMATE_NOTE =
	"Estimated from the size of the book's text file; exact once the book has been downloaded.";

function paceLine(speed: ReadingSpeed, rsvpWpm: number | null): string {
	const rsvp = rsvpWpm !== null ? ` RSVP at ${rsvpWpm} wpm, from your dial.` : "";
	if (speed.isMeasured) {
		const sessions = `${speed.sessionCount} session${speed.sessionCount === 1 ? "" : "s"}`;
		return `Estimated at your pace of ${speed.wpm} wpm, from ${sessions}.${rsvp}`;
	}
	return `Estimated at ${speed.wpm} wpm, a typical reading speed, until you've read a bit.${rsvp}`;
}

function TimeRow({ label, minutes }: { label: string; minutes: number }) {
	return (
		<p className="m-0 flex justify-between gap-4">
			<span className="text-muted-foreground">{label}</span>
			<span className="font-medium tabular-nums">{formatReadingTime(minutes)}</span>
		</p>
	);
}

/**
 * The length badge on a detail page. Tapping it explains where the pages and
 * the reading time come from, since both rest on assumptions a reader may not share.
 */
const LengthFact: React.FC<Props> = ({ length, speed, estimateNote = CATALOG_ESTIMATE_NOTE }) => {
	const rsvpWpm = useRsvpWpm();
	const labels = describeLength(length, speed.wpm);
	if (!labels) return <>Length unknown</>;
	const words = labels.words.toLocaleString("en");

	return (
		<Popover>
			<PopoverTrigger asChild>
				{/* The negative margins match the padding added, so the badge keeps its height while the target reaches 25px. */}
				<button
					type="button"
					aria-label={`${labels.spoken}. How is this worked out?`}
					className="-mx-2 -my-[7px] cursor-pointer border-0 bg-transparent px-2 py-[7px] text-inherit leading-none underline decoration-dotted underline-offset-2"
					data-testid="length-fact"
				>
					{labels.text}
				</button>
			</PopoverTrigger>
			<PopoverContent
				collisionPadding={16}
				hideWhenDetached
				className="space-y-1.5 text-sm"
				data-testid="length-explainer"
			>
				<p className="m-0 font-semibold">
					{length.wordCountEstimated ? `About ${words} words` : `${words} words`}
				</p>
				<TimeRow label="At your pace" minutes={labels.words / speed.wpm} />
				{rsvpWpm !== null && <TimeRow label="RSVP" minutes={labels.words / rsvpWpm} />}
				<p className="m-0 text-muted-foreground">{paceLine(speed, rsvpWpm)}</p>
				<p className="m-0 text-muted-foreground">Pages assume {WORDS_PER_PAGE} words per page.</p>
				{length.wordCountEstimated && <p className="m-0 text-muted-foreground">{estimateNote}</p>}
			</PopoverContent>
		</Popover>
	);
};

export default LengthFact;
