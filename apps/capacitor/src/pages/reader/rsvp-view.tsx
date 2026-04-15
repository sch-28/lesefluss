/**
 * RsvpView — full-screen RSVP word display with focal letter highlighting.
 *
 * Renders one word at a time, advancing via a setTimeout chain.
 * Tap to pause/resume. On resume, acceleration resets and position
 * rewinds by wordOffset words (matching the ESP32 behavior).
 */

import { IonSpinner } from "@ionic/react";
import {
	calcDelay,
	calcOrpIndex,
	findWordIndexAtOffset,
	type RsvpSettings,
	type WordEntry,
} from "@lesefluss/rsvp-core";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Props ──────────────────────────────────────────────────────────────────

export interface RsvpViewProps {
	content: string;
	initialByteOffset: number;
	settings: RsvpSettings;
	fontSize: number;
	onPositionChange: (byteOffset: number) => void;
	onFinished: () => void;
}

const spinnerStyle = { color: "var(--reader-text, currentColor)", width: "32px", height: "32px" };

// ─── Component ──────────────────────────────────────────────────────────────

const RsvpView: React.FC<RsvpViewProps> = ({
	content,
	initialByteOffset,
	settings,
	fontSize,
	onPositionChange,
	onFinished,
}) => {
	// Build word index in a Web Worker so the spinner animates smoothly
	// while the expensive tokenization runs off the main thread.
	// Only rebuilds when content changes — scrub offset changes are handled
	// by the scrub effect below, not by re-running the worker.
	const [words, setWords] = useState<WordEntry[]>([]);
	const initialByteOffsetRef = useRef(initialByteOffset);
	initialByteOffsetRef.current = initialByteOffset;

	useEffect(() => {
		const worker = new Worker(new URL("./word-index.worker.ts", import.meta.url), {
			type: "module",
		});
		worker.postMessage({ content, byteOffset: initialByteOffsetRef.current });
		worker.onmessage = (e: MessageEvent<{ words: WordEntry[]; idx: number }>) => {
			const { words: w, idx } = e.data;
			setWords(w);
			wordIndexRef.current = idx;
			displayedOffsetRef.current = w[idx]?.byteOffset ?? null;
			setCurrentWord(w[idx] ?? null);
			worker.terminate();
		};
		worker.onerror = () => {
			worker.terminate();
		};
		return () => worker.terminate();
	}, [content]);

	// Current word to display — only React state needed for rendering
	const [currentWord, setCurrentWord] = useState<WordEntry | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);

	// Refs for mutable state used in the timeout chain
	const wordIndexRef = useRef(0);
	const displayedOffsetRef = useRef<number | null>(null);
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
		displayedOffsetRef.current = entry.byteOffset;

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
		if (displayedOffsetRef.current !== null) {
			onPositionChangeRef.current(displayedOffsetRef.current);
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
	// When initialByteOffset changes from outside (scrub), jump there.
	// prevOffsetRef is updated unconditionally so we never accumulate a
	// stale diff that fires a spurious re-seek when words finally load.
	const prevOffsetRef = useRef(initialByteOffset);
	useEffect(() => {
		if (initialByteOffset !== prevOffsetRef.current) {
			prevOffsetRef.current = initialByteOffset;
			if (words.length > 0) {
				// Pause if playing
				if (timerRef.current !== null) {
					clearTimeout(timerRef.current);
					timerRef.current = null;
				}
				setIsPlaying(false);
				const idx = findWordIndexAtOffset(words, initialByteOffset);
				wordIndexRef.current = idx;
				displayedOffsetRef.current = words[idx]?.byteOffset ?? null;
				setCurrentWord(words[idx] ?? null);
			}
		}
	}, [initialByteOffset, words]);

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
			if (displayedOffsetRef.current !== null) {
				onPositionChangeRef.current(displayedOffsetRef.current);
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

	if (words.length === 0) {
		return (
			<div className="rsvp-display">
				<IonSpinner style={spinnerStyle} />
			</div>
		);
	}

	return (
		<div className="rsvp-display" onClick={togglePlayPause}>
			{/* Vertical indicator line at xOffset% */}
			<div className="rsvp-focal-line" style={{ left: `${settings.xOffset}%` }} />

			{word && (
				<div
					className="rsvp-word-container"
					style={{
						left: `${settings.xOffset}%`,
						transform: `translate(-${shiftCh}ch, -50%)`,
						fontSize: `${fontSize * 2.5}px`,
					}}
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
