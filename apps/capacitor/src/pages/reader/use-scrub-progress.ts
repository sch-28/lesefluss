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
	readerMode: "scroll" | "rsvp";
	paragraphOffsets: number[];
	findParagraphIndex: (targetByte: number) => number;
	jumpToOffset: (byteOffset: number, opts?: { highlight?: boolean }) => void;
	savePosition: (offset: number) => Promise<void> | void;
	lastOffsetRef: React.RefObject<number | null>;
	setProgressOffset: (offset: number) => void;
	setRsvpInitOffset: (offset: number) => void;
	setProgressBarVisible: (v: boolean) => void;
}

export function useScrubProgress({
	book,
	readerMode,
	paragraphOffsets,
	findParagraphIndex,
	jumpToOffset,
	savePosition,
	lastOffsetRef,
	setProgressOffset,
	setRsvpInitOffset,
	setProgressBarVisible,
}: Params) {
	const progressBarRef = useRef<HTMLDivElement>(null);
	// Origin of the current pointer-down gesture - used to detect horizontal intent
	const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
	const isScrubbingRef = useRef(false);

	const scrubToX = useCallback(
		(clientX: number) => {
			if (!progressBarRef.current || !book) return;
			const rect = progressBarRef.current.getBoundingClientRect();
			const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
			const targetByte = Math.round(ratio * book.size);

			if (readerMode === "rsvp") {
				// In RSVP mode: scrub to position - updates both the progress bar and
				// rsvpInitOffset so RsvpView jumps without triggering a position-save echo.
				setProgressOffset(targetByte);
				setRsvpInitOffset(targetByte);
				lastOffsetRef.current = targetByte;
				savePosition(targetByte);
			} else {
				const idx = findParagraphIndex(targetByte);
				const actualByte = paragraphOffsets[idx] ?? 0;
				jumpToOffset(actualByte, { highlight: false });
			}
		},
		[
			book,
			readerMode,
			paragraphOffsets,
			findParagraphIndex,
			jumpToOffset,
			savePosition,
			lastOffsetRef,
			setProgressOffset,
			setRsvpInitOffset,
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
