/**
 * RsvpView — full-screen RSVP word display with focal letter highlighting.
 *
 * Renders one word at a time, advancing via a setTimeout chain.
 * Tap to pause/resume. On resume, acceleration resets and position
 * rewinds by wordOffset words (matching the ESP32 behavior).
 */

import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	type RsvpSettings,
	type WordEntry,
	calcDelay,
	calcOrpIndex,
} from "./rsvp-engine";

// ─── Props ──────────────────────────────────────────────────────────────────

export interface RsvpViewProps {
	words: WordEntry[];
	initialWordIndex: number;
	settings: RsvpSettings;
	fontSize: number;
	onPositionChange: (byteOffset: number) => void;
	onFinished: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

const RsvpView: React.FC<RsvpViewProps> = ({
	words,
	initialWordIndex,
	settings,
	fontSize,
	onPositionChange,
	onFinished,
}) => {
	// Current word to display — only React state needed for rendering
	const [currentWord, setCurrentWord] = useState<WordEntry | null>(
		words[initialWordIndex] ?? null,
	);
	const [isPlaying, setIsPlaying] = useState(false);

	// Refs for mutable state used in the timeout chain
	const wordIndexRef = useRef(initialWordIndex);
	const accelRef = useRef(0);
	const timerRef = useRef<number | null>(null);
	const lastSaveRef = useRef(0);

	// Ref copies of callbacks to avoid stale closures
	const onPositionChangeRef = useRef(onPositionChange);
	onPositionChangeRef.current = onPositionChange;
	const onFinishedRef = useRef(onFinished);
	onFinishedRef.current = onFinished;
	const settingsRef = useRef(settings);
	settingsRef.current = settings;
	const wordsRef = useRef(words);
	wordsRef.current = words;

	// ── Tick function ────────────────────────────────────────────────────
	const tick = useCallback(() => {
		const w = wordsRef.current;
		const s = settingsRef.current;
		const idx = wordIndexRef.current;

		if (idx >= w.length) {
			setIsPlaying(false);
			onFinishedRef.current();
			return;
		}

		const entry = w[idx];
		setCurrentWord(entry);

		// Position save — throttled to once per 2 seconds
		const now = Date.now();
		if (now - lastSaveRef.current >= 2000) {
			lastSaveRef.current = now;
			onPositionChangeRef.current(entry.byteOffset);
		}

		// Calculate delay and advance
		const { delayMs, nextAcceleration } = calcDelay(entry.word, s, accelRef.current);
		accelRef.current = nextAcceleration;
		wordIndexRef.current = idx + 1;

		timerRef.current = window.setTimeout(tick, delayMs);
	}, []);

	// ── Play / Pause ─────────────────────────────────────────────────────
	const play = useCallback(() => {
		// Reset acceleration on resume (matches ESP32 reset_acceleration)
		accelRef.current = 0;
		lastSaveRef.current = Date.now();
		setIsPlaying(true);
		tick();
	}, [tick]);

	const pause = useCallback(() => {
		if (timerRef.current !== null) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
		setIsPlaying(false);
		// Flush position save on pause
		const idx = wordIndexRef.current - 1;
		if (idx >= 0 && idx < wordsRef.current.length) {
			onPositionChangeRef.current(wordsRef.current[idx].byteOffset);
		}
	}, []);

	const togglePlayPause = useCallback(() => {
		if (isPlaying) {
			pause();
		} else {
			play();
		}
	}, [isPlaying, play, pause]);

	// ── Respond to external position changes (scrub) ─────────────────────
	// When initialWordIndex changes from outside (scrub), jump there
	const prevInitialRef = useRef(initialWordIndex);
	useEffect(() => {
		if (initialWordIndex !== prevInitialRef.current) {
			prevInitialRef.current = initialWordIndex;
			// Pause if playing
			if (timerRef.current !== null) {
				clearTimeout(timerRef.current);
				timerRef.current = null;
			}
			setIsPlaying(false);
			wordIndexRef.current = initialWordIndex;
			setCurrentWord(words[initialWordIndex] ?? null);
		}
	}, [initialWordIndex, words]);

	// ── Visibility change — auto-pause in background ─────────────────────
	useEffect(() => {
		const handleVisibility = () => {
			if (document.hidden && isPlaying) {
				pause();
			}
		};
		document.addEventListener("visibilitychange", handleVisibility);
		return () => document.removeEventListener("visibilitychange", handleVisibility);
	}, [isPlaying, pause]);

	// ── Cleanup on unmount ───────────────────────────────────────────────
	useEffect(() => {
		return () => {
			if (timerRef.current !== null) {
				clearTimeout(timerRef.current);
			}
			// Flush final position
			const idx = wordIndexRef.current - 1;
			if (idx >= 0 && idx < wordsRef.current.length) {
				onPositionChangeRef.current(wordsRef.current[idx].byteOffset);
			}
		};
	}, []);

	// ── Render ───────────────────────────────────────────────────────────
	const word = currentWord?.word ?? "";
	const orpIndex = calcOrpIndex(word.length);
	const before = word.slice(0, orpIndex);
	const focal = word[orpIndex] ?? "";
	const after = word.slice(orpIndex + 1);

	// Position the word so the focal letter center aligns with xOffset%.
	// With monospace, each char = 1ch. The focal letter's center is at
	// (orpIndex + 0.5)ch from the word's left edge. We position the
	// container at xOffset% and shift left by that amount.
	const shiftCh = orpIndex + 0.5;

	return (
		<div
			className="rsvp-display"
			onClick={togglePlayPause}
		>
			{/* Vertical indicator line at xOffset% */}
			<div
				className="rsvp-focal-line"
				style={{ left: `${settings.xOffset}%` }}
			/>

			{word && (
				<div
					className="rsvp-word-container"
					style={{ left: `${settings.xOffset}%`, transform: `translate(-${shiftCh}ch, -50%)`, fontSize: `${fontSize * 2.5}px` }}
				>
					<span className="rsvp-before">{before}</span>
					<span className="rsvp-focal">{focal}</span>
					<span className="rsvp-after">{after}</span>
				</div>
			)}

			{!isPlaying && (
				<div className="rsvp-paused-indicator">
					{currentWord ? "Tap to resume" : "Tap to start"}
				</div>
			)}
		</div>
	);
};

export default RsvpView;
