/**
 * useScrubProgress - owns the progress-bar pointer gestures (tap + horizontal drag).
 *
 * Returns a ref + three pointer handlers to spread onto the progress bar div,
 * plus `isScrubbingRef` which the reader's scroll handler reads to decide
 * whether the progress bar should auto-hide on scroll.
 *
 * Horizontal-intent gating: pointerdown records origin; scrubbing commits only
 * when movement passes MIN_SCRUB_PX and is more horizontal than vertical. This
 * prevents iOS swipe-up home gesture from jumping the reading position.
 */

import type React from "react";
import { useCallback, useRef } from "react";
import type { Book } from "../../services/db/schema";

const MIN_SCRUB_PX = 8;

function isHorizontalScrub(origin: { x: number; y: number }, clientX: number, clientY: number) {
	const dx = Math.abs(clientX - origin.x);
	const dy = Math.abs(clientY - origin.y);
	return dx >= MIN_SCRUB_PX && dx > dy;
}

interface Params {
	book: Book | undefined;
	readerMode: "standard" | "rsvp";
	totalWords: number;
	paragraphStartWords: number[];
	findParagraphIndexForWord: (targetWord: number) => number;
	jumpToWord: (word: number, opts?: { highlight?: boolean }) => void;
	savePosition: (word: number) => Promise<void> | void;
	lastWordRef: React.RefObject<number | null>;
	setProgressWord: (word: number) => void;
	setRsvpInitWord: (word: number) => void;
	setProgressBarVisible: (v: boolean) => void;
}

export function useScrubProgress({
	book,
	readerMode,
	totalWords,
	paragraphStartWords,
	findParagraphIndexForWord,
	jumpToWord,
	savePosition,
	lastWordRef,
	setProgressWord,
	setRsvpInitWord,
	setProgressBarVisible,
}: Params) {
	const progressBarRef = useRef<HTMLDivElement>(null);
	// Origin of the current pointer-down gesture - used to detect horizontal intent
	const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
	const isScrubbingRef = useRef(false);

	const scrubToX = useCallback(
		(clientX: number) => {
			if (!progressBarRef.current || !book || totalWords === 0) return;
			const rect = progressBarRef.current.getBoundingClientRect();
			const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
			const targetWord = Math.min(totalWords - 1, Math.round(ratio * totalWords));

			if (readerMode === "rsvp") {
				// In RSVP mode: scrub to position - updates both the progress bar and
				// rsvpInitWord so RsvpView jumps without triggering a position-save echo.
				setProgressWord(targetWord);
				setRsvpInitWord(targetWord);
				lastWordRef.current = targetWord;
				savePosition(targetWord);
			} else {
				// Standard mode: snap to the nearest paragraph start so the scroll
				// lands at a clean edge (mirrors the byte-era paragraph snap).
				const idx = findParagraphIndexForWord(targetWord);
				const actualWord = paragraphStartWords[idx] ?? 0;
				jumpToWord(actualWord, { highlight: false });
			}
		},
		[
			book,
			readerMode,
			totalWords,
			paragraphStartWords,
			findParagraphIndexForWord,
			jumpToWord,
			savePosition,
			lastWordRef,
			setProgressWord,
			setRsvpInitWord,
		],
	);

	const handleProgressPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
		e.currentTarget.setPointerCapture(e.pointerId);
		// Record origin - scrubbing is committed only once horizontal intent is
		// confirmed (pointermove/pointerup). This prevents the iOS swipe-up home
		// gesture from accidentally jumping the reading position.
		pointerDownRef.current = { x: e.clientX, y: e.clientY };
	}, []);

	const handleProgressPointerMove = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			if (e.buttons === 0 || !pointerDownRef.current) return;
			if (!isHorizontalScrub(pointerDownRef.current, e.clientX, e.clientY)) return;
			isScrubbingRef.current = true;
			scrubToX(e.clientX);
		},
		[scrubToX],
	);

	const handleProgressPointerUp = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			const origin = pointerDownRef.current;
			pointerDownRef.current = null;
			isScrubbingRef.current = false;
			if (!origin) return;
			// Plain tap (no meaningful horizontal drag) - scrub to the tap position.
			if (!isHorizontalScrub(origin, e.clientX, e.clientY)) {
				setProgressBarVisible(true);
				scrubToX(e.clientX);
			}
		},
		[scrubToX, setProgressBarVisible],
	);

	return {
		progressBarRef,
		isScrubbingRef,
		handleProgressPointerDown,
		handleProgressPointerMove,
		handleProgressPointerUp,
	};
}
