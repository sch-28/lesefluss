/**
 * RsvpView - full-screen RSVP word display with focal letter highlighting.
 *
 * Renders one word at a time via the useRsvpEngine hook (tick chain,
 * acceleration ramp, position save). Tap to play/pause. When paused,
 * shows surrounding words (clickable to scrub), a control bar, and a
 * dictionary-lookup button. Haptics gated by the caller's setting.
 */

import { IonIcon, IonSpinner } from "@ionic/react";
import { calcOrpIndex, type RsvpSettings } from "@lesefluss/rsvp-core";
import { bookOutline } from "ionicons/icons";
import React, { useCallback } from "react";
import RsvpControls from "./rsvp-controls";
import { useRsvpEngine } from "./use-rsvp-engine";

export interface RsvpViewProps {
	content: string;
	initialByteOffset: number;
	settings: RsvpSettings;
	fontSize: number;
	haptics: boolean;
	onPositionChange: (byteOffset: number) => void;
	onFinished: () => void;
	onWpmChange: (wpm: number) => void;
	onLookup: (word: string) => void;
}

const spinnerStyle = { color: "var(--reader-text, currentColor)", width: "32px", height: "32px" };

const RsvpView: React.FC<RsvpViewProps> = ({
	content,
	initialByteOffset,
	settings,
	fontSize,
	haptics,
	onPositionChange,
	onFinished,
	onWpmChange,
	onLookup,
}) => {
	const {
		words,
		currentWord,
		isPlaying,
		effectiveWpm,
		context,
		togglePlayPause,
		jumpToWord,
		backWord,
		forwardWord,
		backSentence,
		forwardSentence,
		changeWpm,
		lookupFocalWord,
		handleWordPointerDown,
		cancelLongPress,
	} = useRsvpEngine({
		content,
		initialByteOffset,
		settings,
		haptics,
		onPositionChange,
		onFinished,
		onLookup,
		onWpmChange,
	});

	// Single stable click handler for all context words - uses data-idx
	// on the target button instead of an inline closure per word.
	const handleContextClick = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			e.stopPropagation();
			const target = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-idx]");
			if (!target) return;
			const idx = Number.parseInt(target.dataset.idx ?? "", 10);
			if (Number.isFinite(idx)) jumpToWord(idx);
		},
		[jumpToWord],
	);

	const handleDictClick = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			lookupFocalWord();
		},
		[lookupFocalWord],
	);

	if (words.length === 0) {
		return (
			<div className="rsvp-display">
				<IonSpinner style={spinnerStyle} />
			</div>
		);
	}

	const word = currentWord?.word ?? "";
	const orpIndex = calcOrpIndex(word.length);
	const before = word.slice(0, orpIndex);
	const focal = word[orpIndex] ?? "";
	const after = word.slice(orpIndex + 1);

	// Anchor the container center at xOffset%. The word-line inside is then
	// shifted so its focal letter coincides with the container center - that
	// way context (centered on container) and focal letter share an axis.
	const shiftCh = orpIndex + 0.5;
	const wordShiftCh = word.length / 2 - shiftCh;

	return (
		<div className="rsvp-display" onClick={togglePlayPause}>
			{/* Vertical focal indicator */}
			<div className="rsvp-focal-line" style={{ left: `${settings.xOffset}%` }} />

			{/* Speed chip - shows effective WPM climbing during acceleration ramp */}
			{isPlaying && effectiveWpm > 0 && (
				<div
					className={
						effectiveWpm < settings.wpm
							? "rsvp-speed-chip rsvp-speed-chip--ramping"
							: "rsvp-speed-chip"
					}
				>
					{effectiveWpm} wpm
				</div>
			)}

			{word && (
				<div
					className="rsvp-word-container"
					style={{
						left: `${settings.xOffset}%`,
						transform: "translate(-50%, -50%)",
						fontSize: `${fontSize * 2}px`,
					}}
					onPointerDown={handleWordPointerDown}
					onPointerUp={cancelLongPress}
					onPointerLeave={cancelLongPress}
					onPointerCancel={cancelLongPress}
				>
					{context && context.prev.length > 0 && (
						<div className="rsvp-context-inline rsvp-context-prev" onClick={handleContextClick}>
							...
							{context.prev.map(({ word: cw, idx: ci }) => (
								<button key={ci} type="button" data-idx={ci} className="rsvp-context-word">
									{cw}
								</button>
							))}
						</div>
					)}
					<span className="rsvp-word-line" style={{ transform: `translateX(${wordShiftCh}ch)` }}>
						<span className="rsvp-before">{before}</span>
						<span className="rsvp-focal">{focal}</span>
						<span className="rsvp-after">{after}</span>
					</span>
					{context && context.next.length > 0 && (
						<div className="rsvp-context-inline rsvp-context-next" onClick={handleContextClick}>
							{context.next.map(({ word: cw, idx: ci }) => (
								<button key={ci} type="button" data-idx={ci} className="rsvp-context-word">
									{cw}
								</button>
							))}
							...
						</div>
					)}
				</div>
			)}

			{!isPlaying && !currentWord && <div className="rsvp-paused-indicator">Tap to start</div>}

			{!isPlaying && (
				<>
					<RsvpControls
						wpm={settings.wpm}
						onBackSentence={backSentence}
						onBackWord={backWord}
						onPlayPause={togglePlayPause}
						onForwardWord={forwardWord}
						onForwardSentence={forwardSentence}
						onWpmChange={changeWpm}
					/>
					<button
						type="button"
						className="rsvp-dict-button"
						onClick={handleDictClick}
						aria-label="Dictionary lookup"
					>
						<IonIcon icon={bookOutline} />
					</button>
				</>
			)}
		</div>
	);
};

export default React.memo(RsvpView);
