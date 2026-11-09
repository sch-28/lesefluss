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
	/** The RSVP speed the hint is timed at, when faster than the pace; null hides it. */
	rsvp: RsvpEstimateSpeed | null;
}

export type RsvpEstimateSpeed = { wpm: number; source: "measured" | "setting" };

/** The reader's measured RSVP speed (the one the speed chip shows), else the RSVP speed setting. */
export function rsvpEstimateSpeed(
	measuredWpm: number | null,
	settingWpm: number | null,
): RsvpEstimateSpeed | null {
	if (measuredWpm !== null && measuredWpm > 0) return { wpm: measuredWpm, source: "measured" };
	if (settingWpm !== null && settingWpm > 0) return { wpm: settingWpm, source: "setting" };
	return null;
}

const RSVP_SOURCE_LABELS: Record<RsvpEstimateSpeed["source"], string> = {
	measured: "your speed",
	setting: "your setting",
};

function whatIfLine(minutesLeft: number | null, finishDay: string | null): string {
	const parts = [
		minutesLeft === null ? null : `Left ${formatReadingTime(minutesLeft)}`,
		finishDay === null ? null : `Done ${formatDayKey(finishDay)}`,
	].filter((part) => part !== null);
	return parts.length > 0 ? parts.join(" · ") : "Drag to try another speed";
}

/** A look-ahead at another speed. Local state only: trying a speed never saves it. */
export function WhatIfSpeed({ wordsLeft, paceWpm, minutesPerDay, today, rsvp }: Props) {
	const [start] = useState(() => whatIfStart(paceWpm));
	const [wpm, setWpm] = useState(start);
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
				{whatIfLine(
					// At the starting speed the page already shows the time left: an unread
					// book's total, a started book's Continue button.
					wpm === start ? null : estimate.minutesLeft,
					estimate.finishDay,
				)}
			</p>
			{rsvp !== null && (
				<p className="mt-1 mb-0 text-xs tabular-nums opacity-70" data-testid="rsvp-hint">
					RSVP at {rsvp.wpm} wpm ({RSVP_SOURCE_LABELS[rsvp.source]}):{" "}
					{formatReadingTime(estimateMinutes(wordsLeft, rsvp.wpm))}
				</p>
			)}
		</div>
	);
}
