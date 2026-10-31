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
import {
	isSameWordStream,
	nextSentenceIndex,
	sentenceStartIndex,
	sliceContext,
	stripPunct,
} from "./rsvp-engine";

let hasWarnedWordsChanged = false;
function warnWordsChangedOnce() {
	if (hasWarnedWordsChanged) return;
	hasWarnedWordsChanged = true;
	console.warn("RSVP: the words changed under a playing reader; kept the word on screen");
}

// ─── Tunables ───────────────────────────────────────────────────────────────
const POSITION_SAVE_THROTTLE_MS = 2000;
const TOGGLE_DEBOUNCE_MS = 120;
const LONG_PRESS_MS = 450;
// Read-aloud word onsets bunch together; this floor keeps each word readable.
const VOICE_MIN_DWELL_MS = 120;
const VOICE_MAX_LAG_WORDS = 3;

/** Runs `fn` once the next frame has painted; returns a cancel. */
function afterNextPaint(fn: () => void): () => void {
	let timer: number | null = null;
	const frame = requestAnimationFrame(() => {
		timer = window.setTimeout(fn, 0);
	});
	return () => {
		cancelAnimationFrame(frame);
		if (timer !== null) clearTimeout(timer);
	};
}

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
	// A throttled save waiting for its word to paint. Every stop cancels it: a
	// later-landing save of an older word would rewind the position the stop saved.
	const cancelPendingSaveRef = useRef<(() => void) | null>(null);
	const longPressTimerRef = useRef<number | null>(null);
	const lastToggleRef = useRef(0);
	const voiceWordRef = useRef<number | null>(null);
	const catchUpTimerRef = useRef<number | null>(null);
	const shownAtRef = useRef(Number.NEGATIVE_INFINITY);
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

	const cancelPendingSave = useCallback(() => {
		cancelPendingSaveRef.current?.();
		cancelPendingSaveRef.current = null;
	}, []);

	const stopCatchUp = useCallback(() => {
		if (catchUpTimerRef.current !== null) {
			clearTimeout(catchUpTimerRef.current);
			catchUpTimerRef.current = null;
		}
	}, []);

	// Synchronous rebuild on a cache miss keeps the reader functional for
	// fresh imports whose inline backfill hasn't committed yet.
	useEffect(() => {
		const w = bookWordIndex ? bookWordIndex.listEntries().slice() : buildWordIndex(content);
		const previous = wordsRef.current;
		setWords(w);
		wordsRef.current = w;
		if (previous.length > 0) {
			const anchor = displayedWordRef.current ?? wordIndexRef.current;
			// The view, the timer and the chunks carry on untouched.
			if (isSameWordStream(previous, w, anchor)) return;
			// The text can't change under a mounted reader (the route remounts it per
			// book, and a chapter still loading shows the skeleton). If it ever does,
			// stay near the word on screen rather than going back to the entry word.
			if (import.meta.env.DEV) warnWordsChangedOnce();
			if (timerRef.current !== null) {
				clearTimeout(timerRef.current);
				timerRef.current = null;
			}
			cancelPendingSave();
			stopCatchUp();
			setIsPlaying(false);
			chunksRef.current = [];
			chunkCursorRef.current = 0;
			currentEntryRef.current = null;
			const idx = Math.max(0, Math.min(w.length - 1, anchor));
			setWordIndex(idx);
			wordIndexRef.current = idx;
			displayedWordRef.current = w.length > 0 ? idx : null;
			setCurrentWord(w[idx] ?? null);
			return;
		}
		const idx = Math.max(0, Math.min(w.length - 1, initialWordRef.current));
		setWordIndex(idx);
		wordIndexRef.current = idx;
		displayedWordRef.current = w.length > 0 ? idx : null;
		setCurrentWord(w[idx] ?? null);
	}, [content, bookWordIndex, cancelPendingSave, stopCatchUp]);

	// ── Tick ─────────────────────────────────────────────────────────────
	const tick = useCallback(() => {
		const w = wordsRef.current;
		const s = settingsRef.current;
		const idx = wordIndexRef.current;

		if (idx >= w.length) {
			cancelPendingSave();
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
			shownAtRef.current = Date.now();

			// After paint: the reader page re-render a save causes would delay this
			// word's paint while the next tick stays on schedule.
			const now = Date.now();
			if (now - lastSaveRef.current >= POSITION_SAVE_THROTTLE_MS) {
				lastSaveRef.current = now;
				cancelPendingSave();
				cancelPendingSaveRef.current = afterNextPaint(() => {
					cancelPendingSaveRef.current = null;
					onPositionChangeRef.current(idx);
				});
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
	}, [cancelPendingSave]);

	// ── Play / pause ─────────────────────────────────────────────────────
	const resetChunks = useCallback(() => {
		chunksRef.current = [];
		chunkCursorRef.current = 0;
		currentEntryRef.current = null;
	}, []);

	const play = useCallback(() => {
		stopCatchUp();
		accelRef.current = 0;
		lastSaveRef.current = Date.now();
		resetChunks();
		setIsPlaying(true);
		tick();
	}, [tick, resetChunks, stopCatchUp]);

	/** Puts `idx` on screen, stopping playback; returns false while there are no words. */
	const displayWord = useCallback(
		(idx: number) => {
			const w = wordsRef.current;
			const clamped = Math.max(0, Math.min(w.length - 1, idx));
			const entry = w[clamped];
			if (!entry) return false;
			if (timerRef.current !== null) {
				clearTimeout(timerRef.current);
				timerRef.current = null;
			}
			cancelPendingSave();
			setIsPlaying(false);
			resetChunks();
			wordIndexRef.current = clamped;
			setWordIndex(clamped);
			displayedWordRef.current = clamped;
			shownAtRef.current = Date.now();
			setCurrentWord(entry);
			return true;
		},
		[resetChunks, cancelPendingSave],
	);

	/** Shows `idx` without playback or a position report. */
	const showWord = useCallback(
		(idx: number) => {
			stopCatchUp();
			return displayWord(idx);
		},
		[displayWord, stopCatchUp],
	);

	// A stop saves the word on screen, so a display still catching up first
	// jumps to the voice's word, which the voice has already saved.
	const settleCatchUp = useCallback(() => {
		if (catchUpTimerRef.current !== null && voiceWordRef.current !== null) {
			showWord(voiceWordRef.current);
		}
	}, [showWord]);

	const pause = useCallback(() => {
		settleCatchUp();
		if (timerRef.current !== null) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
		cancelPendingSave();
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
	}, [resetChunks, cancelPendingSave, settleCatchUp]);

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
			if (showWord(idx) && displayedWordRef.current !== null) {
				onPositionChangeRef.current(displayedWordRef.current);
			}
		},
		[showWord],
	);

	const stepTowardVoice = useCallback(() => {
		catchUpTimerRef.current = null;
		const shown = displayedWordRef.current;
		const target = voiceWordRef.current;
		if (shown === null || target === null || shown >= target) return;
		const wait = shownAtRef.current + VOICE_MIN_DWELL_MS - Date.now();
		if (wait > 0) {
			catchUpTimerRef.current = window.setTimeout(stepTowardVoice, wait);
			return;
		}
		displayWord(shown + 1);
		if (shown + 1 < target) {
			catchUpTimerRef.current = window.setTimeout(stepTowardVoice, VOICE_MIN_DWELL_MS);
		}
	}, [displayWord]);

	const followVoice = useCallback(
		(idx: number) => {
			const target = Math.max(0, Math.min(wordsRef.current.length - 1, idx));
			voiceWordRef.current = target;
			const shown = displayedWordRef.current;
			if (shown === null || target < shown || target - shown > VOICE_MAX_LAG_WORDS) {
				showWord(target);
				return;
			}
			if (catchUpTimerRef.current === null) stepTowardVoice();
		},
		[showWord, stepTowardVoice],
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
		// showWord reads the words ref, not `words`: a rebuild in this same commit has already replaced it.
		showWord(initialWord);
	}, [initialWord, showWord]);

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
			settleCatchUp();
			cancelPendingSave();
			if (displayedWordRef.current !== null) {
				onPositionChangeRef.current(displayedWordRef.current);
			}
		};
		window.addEventListener("pagehide", flush);
		return () => window.removeEventListener("pagehide", flush);
	}, [cancelPendingSave, settleCatchUp]);

	// ── Cleanup on unmount ───────────────────────────────────────────────
	useEffect(() => {
		return () => {
			if (timerRef.current !== null) clearTimeout(timerRef.current);
			if (longPressTimerRef.current !== null) clearTimeout(longPressTimerRef.current);
			settleCatchUp();
			stopCatchUp();
			cancelPendingSave();
			if (displayedWordRef.current !== null) {
				onPositionChangeRef.current(displayedWordRef.current);
			}
		};
	}, [cancelPendingSave, settleCatchUp, stopCatchUp]);

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
		showWord,
		followVoice,
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
