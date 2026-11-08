/**
 * useScrubProgress - owns the progress-bar pointer gestures.
 *
 * Drag-only scrubber: a horizontal drag previews its target (`previewWord`)
 * and jumps there on release; a tap never moves the position, it only shows
 * where the reader is (`isShowingInfo`). `isScrubbingRef` tells the reader's
 * scroll handler not to auto-hide the bar mid-drag.
 *
 * Horizontal-intent gating: a drag counts only once movement passes
 * MIN_SCRUB_PX and is more horizontal than vertical, so the iOS swipe-up home
 * gesture is never a scrub.
 */

import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Book } from "../../services/db/schema";
import type { SaveSource } from "../../test-hooks/reader";

const MIN_SCRUB_PX = 8;
const TAP_INFO_MS = 2500;

function isHorizontalScrub(origin: { x: number; y: number }, clientX: number, clientY: number) {
	const dx = Math.abs(clientX - origin.x);
	const dy = Math.abs(clientY - origin.y);
	return dx >= MIN_SCRUB_PX && dx > dy;
}

/** The chapter holding `word`: -1 without chapters, 0 before the first one starts. */
export function chapterIndexAt(chapters: readonly { startWord: number }[], word: number): number {
	if (!chapters.length) return -1;
	for (let i = chapters.length - 1; i >= 0; i--) {
		if (word >= chapters[i].startWord) return i;
	}
	return 0;
}

interface Params {
	book: Book | undefined;
	readerMode: "standard" | "rsvp";
	totalWords: number;
	paragraphStartWords: number[];
	findParagraphIndexForWord: (targetWord: number) => number;
	jumpToWord: (word: number, opts?: { highlight?: boolean }) => void;
	savePosition: (word: number, source: SaveSource) => Promise<void> | void;
	lastWordRef: React.RefObject<number | null>;
	setProgressWord: (word: number) => void;
	setRsvpInitWord: (word: number) => void;
	setProgressBarVisible: (v: boolean) => void;
	/** While reading aloud a scrub moves the voice, which then owns the position. */
	isReadingAloud: () => boolean;
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
	isReadingAloud,
}: Params) {
	const progressBarRef = useRef<HTMLDivElement>(null);
	// Origin of the current pointer-down gesture - used to detect horizontal intent
	const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
	const isScrubbingRef = useRef(false);
	// State twin of isScrubbingRef for rendering the drag bubble.
	const [isDragging, setIsDragging] = useState(false);
	const [previewWord, setPreviewWord] = useState<number | null>(null);
	const [isShowingInfo, setIsShowingInfo] = useState(false);
	const infoTimerRef = useRef<number | null>(null);

	const clearInfoTimer = useCallback(() => {
		if (infoTimerRef.current !== null) window.clearTimeout(infoTimerRef.current);
		infoTimerRef.current = null;
	}, []);
	useEffect(() => clearInfoTimer, [clearInfoTimer]);

	const wordAtX = useCallback(
		(clientX: number): number | null => {
			if (!progressBarRef.current || !book || totalWords === 0) return null;
			const rect = progressBarRef.current.getBoundingClientRect();
			const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
			return Math.min(totalWords - 1, Math.round(ratio * totalWords));
		},
		[book, totalWords],
	);

	const scrubToX = useCallback(
		(clientX: number) => {
			const targetWord = wordAtX(clientX);
			if (targetWord === null) return;

			if (readerMode === "rsvp" && isReadingAloud()) {
				setProgressWord(targetWord);
				jumpToWord(targetWord, { highlight: false });
			} else if (readerMode === "rsvp") {
				// In RSVP mode: scrub to position - updates both the progress bar and
				// rsvpInitWord so RsvpView jumps without triggering a position-save echo.
				setProgressWord(targetWord);
				setRsvpInitWord(targetWord);
				lastWordRef.current = targetWord;
				savePosition(targetWord, "scrub");
			} else {
				// Standard mode: snap to the nearest paragraph start so the scroll
				// lands at a clean edge (mirrors the byte-era paragraph snap).
				const idx = findParagraphIndexForWord(targetWord);
				const actualWord = paragraphStartWords[idx] ?? 0;
				jumpToWord(actualWord, { highlight: false });
			}
		},
		[
			wordAtX,
			readerMode,
			paragraphStartWords,
			findParagraphIndexForWord,
			jumpToWord,
			savePosition,
			lastWordRef,
			isReadingAloud,
			setProgressWord,
			setRsvpInitWord,
		],
	);

	const handleProgressPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
		e.currentTarget.setPointerCapture(e.pointerId);
		pointerDownRef.current = { x: e.clientX, y: e.clientY };
	}, []);

	const handleProgressPointerMove = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			if (e.buttons === 0 || !pointerDownRef.current) return;
			if (
				!isScrubbingRef.current &&
				!isHorizontalScrub(pointerDownRef.current, e.clientX, e.clientY)
			)
				return;
			isScrubbingRef.current = true;
			setIsDragging(true);
			clearInfoTimer();
			setIsShowingInfo(false);
			setPreviewWord(wordAtX(e.clientX));
		},
		[wordAtX, clearInfoTimer],
	);

	const endDrag = useCallback(() => {
		pointerDownRef.current = null;
		isScrubbingRef.current = false;
		setIsDragging(false);
		setPreviewWord(null);
	}, []);

	const handleProgressPointerUp = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			const origin = pointerDownRef.current;
			const wasDragging = isScrubbingRef.current;
			endDrag();
			if (!origin) return;
			if (wasDragging) {
				scrubToX(e.clientX);
				return;
			}
			setProgressBarVisible(true);
			setIsShowingInfo(true);
			clearInfoTimer();
			infoTimerRef.current = window.setTimeout(() => setIsShowingInfo(false), TAP_INFO_MS);
		},
		[endDrag, scrubToX, setProgressBarVisible, clearInfoTimer],
	);

	// The system can take the gesture over (a call, an edge swipe) without a
	// pointerup; the drag ends where it was, without a jump.
	const handleProgressPointerCancel = endDrag;

	return {
		progressBarRef,
		previewWord,
		isShowingInfo,
		handleProgressPointerCancel,
		isScrubbingRef,
		isDragging,
		handleProgressPointerDown,
		handleProgressPointerMove,
		handleProgressPointerUp,
	};
}
