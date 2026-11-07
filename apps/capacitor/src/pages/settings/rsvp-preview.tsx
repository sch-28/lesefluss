/**
 * RsvpPreview - tiny looping RSVP preview for the settings page.
 *
 * Uses the same calcDelay / calcOrpIndex primitives as the real reader so
 * WPM, punctuation delays, acceleration ramp, and focal position all react
 * live. Restarts the ramp on every setting change so changes are visible.
 */

import { calcDelay, type RsvpSettings } from "@lesefluss/core";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { RsvpWordStage } from "../../components/rsvp-word-stage";

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
	const timingKey = `${settings.wpm}:${settings.accelStart}:${settings.accelRate}:${settings.delayComma}:${settings.delayPeriod}`;

	// Reset ramp + rewind to first word whenever settings change so the ease-in is visible again.
	useEffect(() => {
		void timingKey;
		accelRef.current = 0;
		setIndex(0);
	}, [timingKey]);

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

	return (
		<RsvpWordStage
			word={SAMPLE_WORDS[index] ?? ""}
			settings={settings}
			label={`Preview ${playing ? "" : "• paused"}`}
			ariaLabel={playing ? "Pause preview" : "Play preview"}
			onClick={() => setPlaying((p) => !p)}
		/>
	);
};

export default RsvpPreview;
