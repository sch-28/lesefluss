/**
 * RsvpControls: control bar shown when RSVP is paused.
 *
 * Sentence-back, word-back, play/pause, word-forward, sentence-forward, WPM
 * stepper. All button clicks stopPropagation so the underlying display's
 * tap-to-toggle doesn't fire after a button press.
 */

import { SETTING_CONSTRAINTS } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { ChevronsLeft, ChevronsRight, Play, Redo2, Undo2 } from "lucide-react";
import type React from "react";

// Controls only render while paused, so the play/pause button always shows
// the play glyph. No isPlaying prop needed.
interface Props {
	wpm: number;
	onBackSentence: () => void;
	onBackWord: () => void;
	onPlayPause: () => void;
	onForwardWord: () => void;
	onForwardSentence: () => void;
	onWpmChange: (wpm: number) => void;
}

const WPM_STEP = 25;

function clampWpm(n: number): number {
	return Math.min(SETTING_CONSTRAINTS.WPM.max, Math.max(SETTING_CONSTRAINTS.WPM.min, n));
}

const stop = (e: React.MouseEvent | React.PointerEvent) => e.stopPropagation();

const RsvpControls: React.FC<Props> = ({
	wpm,
	onBackSentence,
	onBackWord,
	onPlayPause,
	onForwardWord,
	onForwardSentence,
	onWpmChange,
}) => {
	return (
		<div className="rsvp-controls" onClick={stop} onPointerDown={stop}>
			<div className="rsvp-controls-row">
				<Button
					variant="ghost"
					size="icon"
					onClick={onBackSentence}
					aria-label="Back to sentence start"
				>
					<ChevronsLeft />
				</Button>
				<Button variant="ghost" size="icon" onClick={onBackWord} aria-label="Back one word">
					<Undo2 />
				</Button>
				<button type="button" className="rsvp-playpause" onClick={onPlayPause} aria-label="Play">
					<Play className="size-6" />
				</button>
				<Button variant="ghost" size="icon" onClick={onForwardWord} aria-label="Forward one word">
					<Redo2 />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					onClick={onForwardSentence}
					aria-label="Forward to next sentence"
				>
					<ChevronsRight />
				</Button>
			</div>

			<div className="rsvp-wpm-stepper">
				<button
					type="button"
					className="rsvp-wpm-btn"
					onClick={() => onWpmChange(clampWpm(wpm - WPM_STEP))}
					aria-label="Decrease WPM"
				>
					−
				</button>
				<span className="rsvp-wpm-value">{wpm}</span>
				<button
					type="button"
					className="rsvp-wpm-btn"
					onClick={() => onWpmChange(clampWpm(wpm + WPM_STEP))}
					aria-label="Increase WPM"
				>
					+
				</button>
				<span className="rsvp-wpm-label">wpm</span>
			</div>
		</div>
	);
};

export default RsvpControls;
