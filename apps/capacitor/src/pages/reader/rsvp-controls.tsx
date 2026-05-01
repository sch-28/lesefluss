/**
 * RsvpControls - control bar shown when RSVP is paused.
 *
 * Contains: sentence-back, word-back, play/pause, word-forward, sentence-forward,
 * dictionary, WPM stepper. All button clicks call stopPropagation so the
 * underlying display's tap-to-toggle doesn't fire after a button press.
 */

import { IonButton, IonIcon } from "@ionic/react";
import { SETTING_CONSTRAINTS } from "@lesefluss/core";
import {
	arrowRedoOutline,
	arrowUndoOutline,
	playOutline,
	playSkipBackOutline,
	playSkipForwardOutline,
} from "ionicons/icons";
import type React from "react";

// Controls only render while playback is paused, so the play/pause button
// always shows the play glyph - no isPlaying prop needed.
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
				<IonButton
					fill="clear"
					size="small"
					onClick={onBackSentence}
					aria-label="Back to sentence start"
				>
					<IonIcon slot="icon-only" icon={playSkipBackOutline} />
				</IonButton>
				<IonButton fill="clear" onClick={onBackWord} aria-label="Back one word">
					<IonIcon slot="icon-only" icon={arrowUndoOutline} />
				</IonButton>
				<button type="button" className="rsvp-playpause" onClick={onPlayPause} aria-label="Play">
					<IonIcon icon={playOutline} />
				</button>
				<IonButton fill="clear" onClick={onForwardWord} aria-label="Forward one word">
					<IonIcon slot="icon-only" icon={arrowRedoOutline} />
				</IonButton>
				<IonButton
					fill="clear"
					size="small"
					onClick={onForwardSentence}
					aria-label="Forward to next sentence"
				>
					<IonIcon slot="icon-only" icon={playSkipForwardOutline} />
				</IonButton>
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
