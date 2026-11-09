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

// Controls only render while paused, so the play/pause button always shows
// the play glyph. No isPlaying prop needed.
interface Props {
	/** The RSVP speed, shown and stepped even while the voice paces the words. */
	wpm: number;
	/** Absent where the device can't read aloud. */
	audio?: { isOn: boolean; onToggle: () => void; voiceWpm: number } | null;
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
				<IconButton onClick={onBackSentence} aria-label="Back to sentence start">
					<ChevronsLeft />
				</IconButton>
				<IconButton onClick={onBackWord} aria-label="Back one word">
					<Undo2 />
				</IconButton>
				<button type="button" className="rsvp-playpause" onClick={onPlayPause} aria-label="Play">
					<Play className="size-6" />
				</button>
				<IconButton onClick={onForwardWord} aria-label="Forward one word">
					<Redo2 />
				</IconButton>
				<IconButton onClick={onForwardSentence} aria-label="Forward to next sentence">
					<ChevronsRight />
				</IconButton>
			</div>

			<div className="rsvp-wpm-stepper">
				{audio && (
					<button
						type="button"
						onClick={audio.onToggle}
						aria-pressed={audio.isOn}
						className={cn(
							"inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm hover:bg-muted",
							audio.isOn && "text-primary",
						)}
					>
						<Headphones className="size-5" />
						Listen
					</button>
				)}
				{audio?.isOn && (
					<span className="text-xs opacity-80" data-testid="rsvp-voice-wpm">
						Voice {audio.voiceWpm} wpm
					</span>
				)}
				<RsvpSpeedControl wpm={wpm} onChange={onWpmChange} className="text-[var(--reader-text)]" />
			</div>
		</div>
	);
};

export default RsvpControls;
