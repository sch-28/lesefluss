import { estimateMinutes } from "@lesefluss/core";
import { Slider } from "@lesefluss/ui/slider";
import { useState } from "react";
import { WHAT_IF_WPM, whatIfEstimate, whatIfStart } from "../../services/stats/what-if";
import { formatDayKey } from "../../utils/date-utils";
import { formatReadingTime } from "../../utils/reading-time";

interface Props {
	wordsLeft: number;
	paceWpm: number;
	/** Daily reading time the finish day is projected with; null shows no day. */
	minutesPerDay: number | null;
	today: string;
	/** Faster RSVP speed at the dial, for the contextual hint; null hides it. */
	rsvp: { dial: number; wpm: number } | null;
}

/** A look-ahead at another speed. Local state only: trying a speed never saves it. */
export function WhatIfSpeed({ wordsLeft, paceWpm, minutesPerDay, today, rsvp }: Props) {
	const [wpm, setWpm] = useState(() => whatIfStart(paceWpm));
	const estimate = whatIfEstimate(wordsLeft, wpm, minutesPerDay, today);

	return (
		<div className="mt-4 border-current/10 border-t pt-3" data-testid="what-if-speed">
			<div className="flex items-baseline justify-between text-xs">
				<span className="uppercase tracking-wider opacity-60">What if</span>
				<span className="font-semibold tabular-nums" data-testid="what-if-wpm">
					{wpm} wpm
				</span>
			</div>
			<Slider
				className="mt-3"
				min={WHAT_IF_WPM.min}
				max={WHAT_IF_WPM.max}
				step={WHAT_IF_WPM.step}
				value={[wpm]}
				onValueChange={([next]) => next !== undefined && setWpm(next)}
				thumbProps={{ "aria-label": "Reading speed", "aria-valuetext": `${wpm} words per minute` }}
			/>
			<p className="mt-2 mb-0 text-sm tabular-nums" data-testid="what-if-result">
				Left {formatReadingTime(estimate.minutesLeft)}
				{estimate.finishDay !== null && ` · Done ${formatDayKey(estimate.finishDay)}`}
			</p>
			{rsvp && (
				<p className="mt-1 mb-0 text-xs tabular-nums opacity-70" data-testid="rsvp-hint">
					RSVP {rsvp.dial}: {formatReadingTime(estimateMinutes(wordsLeft, rsvp.wpm))}
				</p>
			)}
		</div>
	);
}
