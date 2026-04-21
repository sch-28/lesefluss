/**
 * RsvpPreview - tiny looping RSVP preview for the settings page.
 *
 * Uses the same calcDelay / calcOrpIndex primitives as the real reader so
 * WPM, punctuation delays, acceleration ramp, and focal position all react
 * live. Restarts the ramp on every setting change so changes are visible.
 */

import { calcDelay, calcOrpIndex, type RsvpSettings } from "@lesefluss/rsvp-core";
import type React from "react";
import { useEffect, useRef, useState } from "react";

const SAMPLE =
	"The quick brown fox jumps over the lazy dog, and then it pauses. Reading faster is a skill you practice.";

const SAMPLE_WORDS = SAMPLE.split(/\s+/);

interface Props {
	settings: RsvpSettings;
}

const RsvpPreview: React.FC<Props> = ({ settings }) => {
	const [index, setIndex] = useState(0);
	const [playing, setPlaying] = useState(true);
	const accelRef = useRef(0);
	const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

	// Reset ramp + rewind to first word whenever settings change so the ease-in is visible again.
	useEffect(() => {
		accelRef.current = 0;
		setIndex(0);
	}, [
		settings.wpm,
		settings.accelStart,
		settings.accelRate,
		settings.delayComma,
		settings.delayPeriod,
	]);

	useEffect(() => {
		if (!playing) return;
		const word = SAMPLE_WORDS[index] ?? SAMPLE_WORDS[0];
		const { delayMs, nextAcceleration } = calcDelay(word, settings, accelRef.current);
		accelRef.current = nextAcceleration;
		timerRef.current = setTimeout(() => {
			setIndex((i) => {
				const next = i + 1;
				if (next >= SAMPLE_WORDS.length) {
					accelRef.current = 0;
					return 0;
				}
				return next;
			});
		}, delayMs);
		return () => clearTimeout(timerRef.current);
	}, [index, playing, settings]);

	const word = SAMPLE_WORDS[index] ?? "";
	const orpIndex = calcOrpIndex(word.length);
	const before = word.slice(0, orpIndex);
	const focal = word[orpIndex] ?? "";
	const after = word.slice(orpIndex + 1);

	const shiftCh = orpIndex + 0.5;
	const wordShiftCh = word.length / 2 - shiftCh;

	return (
		<button
			type="button"
			className="rsvp-preview-card"
			onClick={() => setPlaying((p) => !p)}
			aria-label={playing ? "Pause preview" : "Play preview"}
		>
			<span className="rsvp-preview-label">Preview {playing ? "" : "• paused"}</span>
			<span className="rsvp-preview-stage">
				<span className="rsvp-focal-line" style={{ left: `${settings.xOffset}%` }} />
				<span
					className="rsvp-preview-word"
					style={{ left: `${settings.xOffset}%`, transform: "translate(-50%, -50%)" }}
				>
					<span className="rsvp-word-line" style={{ transform: `translateX(${wordShiftCh}ch)` }}>
						<span className="rsvp-before">{before}</span>
						<span className="rsvp-focal">{focal}</span>
						<span className="rsvp-after">{after}</span>
					</span>
				</span>
			</span>
		</button>
	);
};

export default RsvpPreview;
