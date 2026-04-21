/**
 * useRsvpEngine - playback state machine for RsvpView.
 *
 * Owns the tick loop (setTimeout chain), word index, acceleration ramp,
 * and external hooks for position save / finish / dictionary lookup.
 * Keeps presentation concerns (DOM, CSS, long-press UX) out of the hook.
 */

import {
	calcDelay,
	findWordIndexAtOffset,
	type RsvpSettings,
	type WordEntry,
} from "@lesefluss/rsvp-core";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cleanWord, nextSentenceIndex, sentenceStartIndex, sliceContext } from "./rsvp-engine";

// ─── Tunables ───────────────────────────────────────────────────────────────
const POSITION_SAVE_THROTTLE_MS = 2000;
const TOGGLE_DEBOUNCE_MS = 120;
const LONG_PRESS_MS = 450;

interface Options {
	content: string;
	initialByteOffset: number;
	settings: RsvpSettings;
	onPositionChange: (byteOffset: number) => void;
	onFinished: () => void;
	onLookup: (word: string) => void;
	onWpmChange: (wpm: number) => void;
}

export function useRsvpEngine({
	content,
	initialByteOffset,
	settings,
	onPositionChange,
	onFinished,
	onLookup,
	onWpmChange,
}: Options) {
	// ── Rendered state ───────────────────────────────────────────────────
	const [words, setWords] = useState<WordEntry[]>([]);
	const [currentWord, setCurrentWord] = useState<WordEntry | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [wordIndex, setWordIndex] = useState(0);
	const [effectiveWpm, setEffectiveWpm] = useState(0);

	// ── Refs for the tick loop ───────────────────────────────────────────
	const wordIndexRef = useRef(0);
	const displayedOffsetRef = useRef<number | null>(null);
	const accelRef = useRef(0);
	const timerRef = useRef<number | null>(null);
	const lastSaveRef = useRef(0);
	const longPressTimerRef = useRef<number | null>(null);
	const lastToggleRef = useRef(0);
	const initialByteOffsetRef = useRef(initialByteOffset);
	initialByteOffsetRef.current = initialByteOffset;

	// ── Ref copies of props (avoid stale closures in the tick chain) ─────
	const onPositionChangeRef = useRef(onPositionChange);
	onPositionChangeRef.current = onPositionChange;
	const onFinishedRef = useRef(onFinished);
	onFinishedRef.current = onFinished;
	const onLookupRef = useRef(onLookup);
	onLookupRef.current = onLookup;
	const onWpmChangeRef = useRef(onWpmChange);
	onWpmChangeRef.current = onWpmChange;
	const settingsRef = useRef(settings);
	settingsRef.current = settings;
	const wordsRef = useRef(words);
	wordsRef.current = words;
	const isPlayingRef = useRef(isPlaying);
	isPlayingRef.current = isPlaying;

	// ── Word index built in a worker ─────────────────────────────────────
	useEffect(() => {
		const worker = new Worker(new URL("./word-index.worker.ts", import.meta.url), {
			type: "module",
		});
		worker.postMessage({ content, byteOffset: initialByteOffsetRef.current });
		worker.onmessage = (e: MessageEvent<{ words: WordEntry[]; idx: number }>) => {
			const { words: w, idx } = e.data;
			setWords(w);
			setWordIndex(idx);
			wordIndexRef.current = idx;
			displayedOffsetRef.current = w[idx]?.byteOffset ?? null;
			setCurrentWord(w[idx] ?? null);
			worker.terminate();
		};
		worker.onerror = () => worker.terminate();
		return () => worker.terminate();
	}, [content]);

	// ── Tick ─────────────────────────────────────────────────────────────
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
		setWordIndex(idx);
		displayedOffsetRef.current = entry.byteOffset;

		// Throttled position save
		const now = Date.now();
		if (now - lastSaveRef.current >= POSITION_SAVE_THROTTLE_MS) {
			lastSaveRef.current = now;
			onPositionChangeRef.current(entry.byteOffset);
		}

		// Effective WPM (only update on change to avoid extra renders once ramp settles)
		const multiplier = s.accelStart - accelRef.current;
		const nextWpm = Math.round(s.wpm / multiplier);
		setEffectiveWpm((prev) => (prev === nextWpm ? prev : nextWpm));

		const { delayMs, nextAcceleration } = calcDelay(entry.word, s, accelRef.current);
		accelRef.current = nextAcceleration;
		wordIndexRef.current = idx + 1;
		timerRef.current = window.setTimeout(tick, delayMs);
	}, []);

	// ── Play / pause ─────────────────────────────────────────────────────
	const play = useCallback(() => {
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
		if (displayedOffsetRef.current !== null) {
			onPositionChangeRef.current(displayedOffsetRef.current);
		}
	}, []);

	const togglePlayPause = useCallback(() => {
		// Mobile can emit synthetic + real click in quick succession.
		const now = Date.now();
		if (now - lastToggleRef.current < TOGGLE_DEBOUNCE_MS) return;
		lastToggleRef.current = now;
		if (isPlayingRef.current) pause();
		else play();
	}, [play, pause]);

	// ── Jump helpers ─────────────────────────────────────────────────────
	const jumpToWord = useCallback((idx: number) => {
		const w = wordsRef.current;
		if (w.length === 0) return;
		const clamped = Math.max(0, Math.min(w.length - 1, idx));
		if (timerRef.current !== null) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
		setIsPlaying(false);
		wordIndexRef.current = clamped;
		setWordIndex(clamped);
		const entry = w[clamped];
		displayedOffsetRef.current = entry.byteOffset;
		setCurrentWord(entry);
		onPositionChangeRef.current(entry.byteOffset);
	}, []);

	const backWord = useCallback(() => jumpToWord(wordIndexRef.current - 1), [jumpToWord]);
	const forwardWord = useCallback(() => jumpToWord(wordIndexRef.current + 1), [jumpToWord]);
	const backSentence = useCallback(
		() => jumpToWord(sentenceStartIndex(wordsRef.current, wordIndexRef.current)),
		[jumpToWord],
	);
	const forwardSentence = useCallback(
		() => jumpToWord(nextSentenceIndex(wordsRef.current, wordIndexRef.current)),
		[jumpToWord],
	);

	// ── WPM change ───────────────────────────────────────────────────────
	const changeWpm = useCallback((wpm: number) => {
		onWpmChangeRef.current(wpm);
	}, []);

	// ── Dictionary lookup on the focal word ──────────────────────────────
	const lookupFocalWord = useCallback(() => {
		const entry = wordsRef.current[wordIndexRef.current];
		if (!entry) return;
		const clean = cleanWord(entry.word);
		if (!clean) return;
		onLookupRef.current(clean);
	}, []);

	// ── Long-press (dict lookup while paused) ────────────────────────────
	// Attached to the display root; bails if the gesture starts on an
	// interactive overlay (controls, dict button, context word) so holding
	// those buttons doesn't accidentally open the dictionary.
	const handleDisplayPointerDown = useCallback(
		(e: React.PointerEvent) => {
			if (isPlayingRef.current) return;
			const target = e.target as HTMLElement;
			if (
				target.closest?.(
					".rsvp-controls, .rsvp-dict-button, .rsvp-settings-button, .rsvp-context-word",
				)
			)
				return;
			if (longPressTimerRef.current !== null) clearTimeout(longPressTimerRef.current);
			longPressTimerRef.current = window.setTimeout(() => {
				longPressTimerRef.current = null;
				lookupFocalWord();
			}, LONG_PRESS_MS);
		},
		[lookupFocalWord],
	);

	const cancelLongPress = useCallback(() => {
		if (longPressTimerRef.current !== null) {
			clearTimeout(longPressTimerRef.current);
			longPressTimerRef.current = null;
		}
	}, []);

	// ── External scrub (initialByteOffset changes from parent) ───────────
	const prevOffsetRef = useRef(initialByteOffset);
	useEffect(() => {
		if (initialByteOffset === prevOffsetRef.current) return;
		prevOffsetRef.current = initialByteOffset;
		if (words.length === 0) return;
		if (timerRef.current !== null) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
		setIsPlaying(false);
		const idx = findWordIndexAtOffset(words, initialByteOffset);
		wordIndexRef.current = idx;
		setWordIndex(idx);
		displayedOffsetRef.current = words[idx]?.byteOffset ?? null;
		setCurrentWord(words[idx] ?? null);
	}, [initialByteOffset, words]);

	// ── Auto-pause in background ─────────────────────────────────────────
	useEffect(() => {
		const handleVisibility = () => {
			if (document.hidden && isPlaying) pause();
		};
		document.addEventListener("visibilitychange", handleVisibility);
		return () => document.removeEventListener("visibilitychange", handleVisibility);
	}, [isPlaying, pause]);

	// ── Cleanup on unmount ───────────────────────────────────────────────
	useEffect(() => {
		return () => {
			if (timerRef.current !== null) clearTimeout(timerRef.current);
			if (longPressTimerRef.current !== null) clearTimeout(longPressTimerRef.current);
			if (displayedOffsetRef.current !== null) {
				onPositionChangeRef.current(displayedOffsetRef.current);
			}
		};
	}, []);

	// ── Context (only computed when paused) ──────────────────────────────
	const context = useMemo(
		() => (isPlaying || words.length === 0 ? null : sliceContext(words, wordIndex)),
		[isPlaying, words, wordIndex],
	);

	return {
		// state
		words,
		currentWord,
		wordIndex,
		isPlaying,
		effectiveWpm,
		context,
		// actions
		togglePlayPause,
		pause,
		jumpToWord,
		backWord,
		forwardWord,
		backSentence,
		forwardSentence,
		changeWpm,
		lookupFocalWord,
		// long-press handlers for the display root
		handleDisplayPointerDown,
		cancelLongPress,
	};
}
