import type { RsvpSettings } from "@lesefluss/core";
import { useEffect, useMemo } from "react";
import { rsvpDelays } from "../../services/stats/speed-test";
import { RsvpWordStage } from "../rsvp-word-stage";
import { SpeedGauge } from "./gauge";
import { Stat } from "./stat";

export interface RsvpProgress {
	shown: number;
	playing: boolean;
}

interface Props {
	words: readonly string[];
	settings: RsvpSettings;
	readingWpm: number;
	progress: RsvpProgress;
	onProgress: (progress: RsvpProgress) => void;
}

/** The passage's next part at the dial, word by word, with the reader's own timing. */
export function RsvpRound({ words, settings, readingWpm, progress, onProgress }: Props) {
	const delays = useMemo(() => rsvpDelays(words, settings), [words, settings]);
	const { shown, playing } = progress;
	const finished = shown >= words.length;

	useEffect(() => {
		if (!playing || finished) return;
		const timer = setTimeout(() => {
			const next = shown + 1;
			onProgress({ shown: next, playing: next < words.length });
		}, delays[shown]);
		return () => clearTimeout(timer);
	}, [playing, finished, shown, delays, words.length, onProgress]);

	const word = words[Math.min(shown, words.length - 1)] ?? "";
	const elapsedMs = delays.slice(0, shown).reduce((sum, d) => sum + d, 0);
	const hint = finished ? "Done" : playing ? "Tap to pause" : shown > 0 ? "Paused" : "Tap to start";

	return (
		<div>
			<SpeedGauge
				dial={settings.wpm}
				value={String(settings.wpm)}
				label="RSVP dial"
				animate={false}
			/>
			<RsvpWordStage
				word={word}
				settings={settings}
				label={hint}
				ariaLabel={playing ? "Pause" : "Play"}
				onClick={() => !finished && onProgress({ shown, playing: !playing })}
				className="mt-4"
				testId="speed-test-rsvp-stage"
			/>
			<div className="h-1 overflow-hidden rounded-full bg-muted">
				<div
					className="h-full bg-primary"
					style={{ width: `${(shown / Math.max(1, words.length)) * 100}%` }}
				/>
			</div>
			<dl className="mt-4 grid grid-cols-3 gap-2 text-center">
				<Stat label="Words" value={`${shown}/${words.length}`} />
				<Stat label="Time" value={`${Math.round(elapsedMs / 1000)}s`} />
				<Stat label="Reading wpm" value={String(readingWpm)} />
			</dl>
		</div>
	);
}
