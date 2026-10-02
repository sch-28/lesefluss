import { Popover, PopoverContent, PopoverTrigger } from "@lesefluss/ui/popover";
import type React from "react";
import { WORDS_PER_PAGE } from "../../utils/reading-time";
import { type BookLength, describeLength } from "./length";
import type { ReadingSpeed } from "./use-reading-speed";

type Props = {
	length: BookLength;
	speed: ReadingSpeed;
	/** Shown when the length is an estimate: what it rests on and when it becomes exact. */
	estimateNote?: string;
};

const CATALOG_ESTIMATE_NOTE =
	"Estimated from the size of the book's text file; exact once the book has been downloaded.";

function paceLine(speed: ReadingSpeed): string {
	if (speed.isMeasured) {
		const sessions = `${speed.sessionCount} session${speed.sessionCount === 1 ? "" : "s"}`;
		return `Reading time at ${speed.wpm} wpm, your average over ${sessions}.`;
	}
	return `Reading time at ${speed.wpm} wpm, a typical reading speed. It adjusts once you've read a bit.`;
}

/**
 * The length badge on a detail page. Tapping it explains where the pages and
 * the reading time come from, since both rest on assumptions a reader may not share.
 */
const LengthFact: React.FC<Props> = ({ length, speed, estimateNote = CATALOG_ESTIMATE_NOTE }) => {
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
				<p className="m-0 text-muted-foreground">Pages assume {WORDS_PER_PAGE} words per page.</p>
				<p className="m-0 text-muted-foreground">{paceLine(speed)}</p>
				{length.wordCountEstimated && <p className="m-0 text-muted-foreground">{estimateNote}</p>}
			</PopoverContent>
		</Popover>
	);
};

export default LengthFact;
