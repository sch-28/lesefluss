/**
 * RsvpControls: control bar shown when RSVP is paused. All button clicks
 * stopPropagation so the underlying display's tap-to-toggle doesn't fire after
 * a button press.
 */

import { IconButton } from "@lesefluss/ui/icon-button";
import { cn } from "@lesefluss/ui/utils";
import { ChevronsLeft, ChevronsRight, Headphones, Play, Redo2, Undo2 } from "lucide-react";
import type React from "react";
import { RsvpSpeedControl } from "../../components/rsvp-speed-control";
import type { WpmRange } from "./wpm";

// Controls only render while paused, so the play/pause button always shows
// the play glyph. No isPlaying prop needed.
interface Props {
	/** The speed that paces the words: the voice's while read-aloud is on, else the RSVP wpm. */
	wpm: number;
	range?: WpmRange;
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

/** px, not rem: at a 200 % App text size rem buttons grow to 88px and push both rows off a
 *  phone. The buttons and glyphs keep play/pause's 44px; the speed text still scales. */
const BUTTON = "size-[44px]";
const GLYPH = "size-[20px]";

const RsvpControls: React.FC<Props> = ({
	wpm,
	range,
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
		<div className="rsvp-controls" data-toast-clear onPointerDown={stop}>
			<div className="rsvp-controls-row">
				<IconButton className={BUTTON} onClick={onBackSentence} aria-label="Back to sentence start">
					<ChevronsLeft className={GLYPH} />
				</IconButton>
				<IconButton className={BUTTON} onClick={onBackWord} aria-label="Back one word">
					<Undo2 className={GLYPH} />
				</IconButton>
				<button type="button" className="rsvp-playpause" onClick={onPlayPause} aria-label="Play">
					<Play className="size-[24px]" />
				</button>
				<IconButton className={BUTTON} onClick={onForwardWord} aria-label="Forward one word">
					<Redo2 className={GLYPH} />
				</IconButton>
				<IconButton
					className={BUTTON}
					onClick={onForwardSentence}
					aria-label="Forward to next sentence"
				>
					<ChevronsRight className={GLYPH} />
				</IconButton>
			</div>

			<div className="rsvp-wpm-stepper">
				{audio && (
					<IconButton
						onClick={audio.onToggle}
						aria-label="Listen"
						aria-pressed={audio.isOn}
						className={cn(BUTTON, audio.isOn && "text-primary")}
					>
						<Headphones className={GLYPH} />
					</IconButton>
				)}
				<RsvpSpeedControl
					wpm={wpm}
					range={range}
					label={audio?.isOn ? "Voice speed" : "Speed"}
					onChange={onWpmChange}
					className="text-[var(--reader-text)] [&>button]:size-[44px]"
				/>
			</div>
		</div>
	);
};

export default RsvpControls;
