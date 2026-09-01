/**
 * useRsvpEngine - playback state machine for RsvpView.
 *
 * Owns the tick loop (setTimeout chain), word index, acceleration ramp,
 * and external hooks for position save / finish / dictionary lookup.
 * Keeps presentation concerns (DOM, CSS, long-press UX) out of the hook.
 */

import {
	buildWordIndex,
	calcDelay,
	type RsvpSettings,
	splitLongWord,
	type WordEntry,
	type WordIndex,
} from "@lesefluss/core";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { nextSentenceIndex, sentenceStartIndex, sliceContext, stripPunct } from "./rsvp-engine";

// ─── Tunables ───────────────────────────────────────────────────────────────
const POSITION_SAVE_THROTTLE_MS = 2000;
const TOGGLE_DEBOUNCE_MS = 120;
const LONG_PRESS_MS = 450;

interface Options {
	content: string;
	initialWord: number;
	settings: RsvpSettings;
	onPositionChange: (word: number) => void;
	onFinished: () => void;
	onLookup: (word: string) => void;
	onWpmChange: (wpm: number) => void;
	/**
	 * Optional preloaded WordIndex. When present, tokenization is reused
	 * from the cached blob; null falls back to a synchronous rebuild from
	 * `content`.
	 */
	bookWordIndex?: WordIndex | null;
}

export function useRsvpEngine({
	content,
	initialWord,
	settings,
	onPositionChange,
	onFinished,
	onLookup,
	onWpmChange,
	bookWordIndex,
}: Options) {
	// ── Rendered state ───────────────────────────────────────────────────
	const [words, setWords] = useState<WordEntry[]>([]);
	const [currentWord, setCurrentWord] = useState<WordEntry | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [wordIndex, setWordIndex] = useState(0);
	const [effectiveWpm, setEffectiveWpm] = useState(0);

	// ── Refs for the tick loop ───────────────────────────────────────────
	const wordIndexRef = useRef(0);
	// Last word index pushed to the parent via onPositionChange. Null until
	// the engine has displayed a word.
	const displayedWordRef = useRef<number | null>(null);
	const accelRef = useRef(0);
	const timerRef = useRef<number | null>(null);
	const lastSaveRef = useRef(0);
	const longPressTimerRef = useRef<number | null>(null);
	const lastToggleRef = useRef(0);
	// Chunks of the currently-displayed word (length 1 for normal words). When
	// the cursor reaches the end, the next tick advances to the next word.
	const chunksRef = useRef<string[]>([]);
	const chunkCursorRef = useRef(0);
	// The original WordEntry for the chunks above - used to restore the focal
	// view on pause without recomputing from a possibly-advanced wordIndexRef.
	const currentEntryRef = useRef<WordEntry | null>(null);
	const initialWordRef = useRef(initialWord);
	initialWordRef.current = initialWord;

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

	// Synchronous rebuild on a cache miss keeps the reader functional for
	// fresh imports whose inline backfill hasn't committed yet.
	useEffect(() => {
		const w = bookWordIndex ? bookWordIndex.listEntries().slice() : buildWordIndex(content);
		const idx = Math.max(0, Math.min(w.length - 1, initialWordRef.current));
		setWords(w);
		setWordIndex(idx);
		wordIndexRef.current = idx;
		displayedWordRef.current = w.length > 0 ? idx : null;
		setCurrentWord(w[idx] ?? null);
	}, [content, bookWordIndex]);

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

		// Begin a new word: split into chunks, save position once at the
		// original word index (all chunks share the same word).
		if (chunkCursorRef.current >= chunksRef.current.length) {
			chunksRef.current = splitLongWord(entry.word);
			chunkCursorRef.current = 0;
			currentEntryRef.current = entry;
			displayedWordRef.current = idx;

			const now = Date.now();
			if (now - lastSaveRef.current >= POSITION_SAVE_THROTTLE_MS) {
				lastSaveRef.current = now;
				onPositionChangeRef.current(idx);
			}
		}

		const chunk = chunksRef.current[chunkCursorRef.current];
		chunkCursorRef.current += 1;
		const isLastChunk = chunkCursorRef.current >= chunksRef.current.length;

		// Render the chunk while keeping the original byteOffset.
		setCurrentWord(chunk === entry.word ? entry : { word: chunk, byteOffset: entry.byteOffset });
		setWordIndex(idx);

		// Effective WPM (only update on change to avoid extra renders once ramp settles)
		const multiplier = s.accelStart - accelRef.current;
		const nextWpm = Math.round(s.wpm / multiplier);
		setEffectiveWpm((prev) => (prev === nextWpm ? prev : nextWpm));

		// Punctuation lives at the end of the original word, so it lands on
		// the last chunk naturally; calcDelay on the chunk does the right thing.
		const { delayMs, nextAcceleration } = calcDelay(chunk, s, accelRef.current);
		accelRef.current = nextAcceleration;
		if (isLastChunk) wordIndexRef.current = idx + 1;
		timerRef.current = window.setTimeout(tick, delayMs);
	}, []);

	// ── Play / pause ─────────────────────────────────────────────────────
	const resetChunks = useCallback(() => {
		chunksRef.current = [];
		chunkCursorRef.current = 0;
		currentEntryRef.current = null;
	}, []);

	const play = useCallback(() => {
		accelRef.current = 0;
		lastSaveRef.current = Date.now();
		resetChunks();
		setIsPlaying(true);
		tick();
	}, [tick, resetChunks]);

	const pause = useCallback(() => {
		if (timerRef.current !== null) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
		setIsPlaying(false);
		if (displayedWordRef.current !== null) {
			onPositionChangeRef.current(displayedWordRef.current);
		}
		// Restore the original full word so the focal/context view doesn't
		// sit on a mid-word chunk. Use currentEntryRef rather than
		// wordsRef[wordIndexRef] - the latter may have already advanced past
		// the displayed word after the last-chunk tick.
		if (currentEntryRef.current) setCurrentWord(currentEntryRef.current);
		resetChunks();
	}, [resetChunks]);

	const togglePlayPause = useCallback(() => {
		// Mobile can emit synthetic + real click in quick succession.
		const now = Date.now();
		if (now - lastToggleRef.current < TOGGLE_DEBOUNCE_MS) return;
		lastToggleRef.current = now;
		if (isPlayingRef.current) pause();
		else play();
	}, [play, pause]);

	// ── Jump helpers ─────────────────────────────────────────────────────
	const jumpToWord = useCallback(
		(idx: number) => {
			const w = wordsRef.current;
			if (w.length === 0) return;
			const clamped = Math.max(0, Math.min(w.length - 1, idx));
			if (timerRef.current !== null) {
				clearTimeout(timerRef.current);
				timerRef.current = null;
			}
			setIsPlaying(false);
			resetChunks();
			wordIndexRef.current = clamped;
			setWordIndex(clamped);
			const entry = w[clamped];
			displayedWordRef.current = clamped;
			setCurrentWord(entry);
			onPositionChangeRef.current(clamped);
		},
		[resetChunks],
	);

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
		// Original casing: the dictionary API derives its own lookup key, and
		// casing disambiguates German homographs.
		const word = stripPunct(entry.word);
		if (!word) return;
		onLookupRef.current(word);
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

	// ── External scrub (initialWord changes from parent) ─────────────────
	const prevWordRef = useRef(initialWord);
	useEffect(() => {
		if (initialWord === prevWordRef.current) return;
		prevWordRef.current = initialWord;
		if (words.length === 0) return;
		if (timerRef.current !== null) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
		setIsPlaying(false);
		resetChunks();
		const idx = Math.max(0, Math.min(words.length - 1, initialWord));
		wordIndexRef.current = idx;
		setWordIndex(idx);
		displayedWordRef.current = idx;
		setCurrentWord(words[idx] ?? null);
	}, [initialWord, words, resetChunks]);

	// ── Auto-pause in background ─────────────────────────────────────────
	useEffect(() => {
		const handleVisibility = () => {
			if (document.hidden && isPlaying) pause();
		};
		document.addEventListener("visibilitychange", handleVisibility);
		return () => document.removeEventListener("visibilitychange", handleVisibility);
	}, [isPlaying, pause]);

	// ── Flush position on teardown ───────────────────────────────────────
	// Saves are throttled to every POSITION_SAVE_THROTTLE_MS during playback,
	// so the displayed word runs ahead of the last write for up to ~2s. A web
	// tab close / bfcache fires `pagehide` without a React unmount, and the
	// visibility auto-pause above only fires when the document goes hidden;
	// flush the freshest displayed word here so backgrounding mid-window
	// doesn't rewind resume to the last throttled save.
	useEffect(() => {
		const flush = () => {
			if (displayedWordRef.current !== null) {
				onPositionChangeRef.current(displayedWordRef.current);
			}
		};
		window.addEventListener("pagehide", flush);
		return () => window.removeEventListener("pagehide", flush);
	}, []);

	// ── Cleanup on unmount ───────────────────────────────────────────────
	useEffect(() => {
		return () => {
			if (timerRef.current !== null) clearTimeout(timerRef.current);
			if (longPressTimerRef.current !== null) clearTimeout(longPressTimerRef.current);
			if (displayedWordRef.current !== null) {
				onPositionChangeRef.current(displayedWordRef.current);
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
