/**
 * RsvpControls: control bar shown when RSVP is paused. All button clicks
 * stopPropagation so the underlying display's tap-to-toggle doesn't fire after
 * a button press.
 */

import { Button } from "@lesefluss/ui/button";
import { cn } from "@lesefluss/ui/utils";
import { ChevronsLeft, ChevronsRight, Headphones, Play, Redo2, Undo2 } from "lucide-react";
import type React from "react";
import { RsvpSpeedControl } from "../../components/rsvp-speed-control";
import { RSVP_WPM_RANGE, type WpmRange } from "./wpm";

// Controls only render while paused, so the play/pause button always shows
// the play glyph. No isPlaying prop needed.
interface Props {
	wpm: number;
	wpmRange?: WpmRange;
	/** Absent where the device can't read aloud. */
	audio?: { isOn: boolean; onToggle: () => void } | null;
	onBackSentence: () => void;
	onBackWord: () => void;
	onPlayPause: () => void;
	onForwardWord: () => void;
	onForwardSentence: () => void;
	onWpmChange: (wpm: number) => void;
}

const stop = (e: React.PointerEvent) => e.stopPropagation();

const RsvpControls: React.FC<Props> = ({
	wpm,
	wpmRange = RSVP_WPM_RANGE,
	audio = null,
	onBackSentence,
	onBackWord,
	onPlayPause,
	onForwardWord,
	onForwardSentence,
	onWpmChange,
}) => {
	return (
		// No onClick here: React would give the div a native onclick, making it a
		// clickable node for screen readers. The display ignores clicks from inside.
		<div className="rsvp-controls" onPointerDown={stop}>
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
				{audio && (
					<Button
						variant="ghost"
						size="icon"
						onClick={audio.onToggle}
						aria-label="Listen"
						aria-pressed={audio.isOn}
						className={cn(audio.isOn && "text-primary")}
					>
						<Headphones />
					</Button>
				)}
				<RsvpSpeedControl
					wpm={wpm}
					range={wpmRange}
					onChange={onWpmChange}
					className="text-[var(--reader-text)]"
				/>
			</div>
		</div>
	);
};

export default RsvpControls;
