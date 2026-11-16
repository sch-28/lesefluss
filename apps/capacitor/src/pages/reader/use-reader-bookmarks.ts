import { wordPos } from "@lesefluss/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { queryHooks } from "../../services/db/hooks";
import type { Bookmark } from "../../services/db/schema";
import type { ReaderApi } from "./reader-api/types";

type VisibleWords = { first: number; last: number };

const NO_BOOKMARKS: Bookmark[] = [];
// A jump or page turn reports before the view has moved; a second read after
// the relayout catches where it landed.
const RELAYOUT_MS = 300;

/** The first bookmark after `current`, else the first one; null without bookmarks. `words` are in reading order. */
export function nextBookmarkWord(words: readonly number[], current: number): number | null {
	if (words.length === 0) return null;
	return words.find((word) => word > current) ?? words[0];
}

/** The last of `items` at or before `word`; `items` are in reading order. */
export function lastAtOrBefore<T>(
	items: readonly T[],
	word: number,
	wordOf: (item: T) => number,
): T | undefined {
	let found: T | undefined;
	for (const item of items) {
		if (wordOf(item) > word) break;
		found = item;
	}
	return found;
}

export function hasBookmarkOnScreen(
	bookmarks: readonly Bookmark[],
	visible: VisibleWords | null,
): boolean {
	if (!visible) return false;
	return bookmarks.some((b) => b.word >= visible.first && b.word <= visible.last);
}

function sameRange(a: VisibleWords | null, b: VisibleWords | null): boolean {
	return a?.first === b?.first && a?.last === b?.last;
}

/**
 * The book's bookmarks against what is on screen. Never saves the reading
 * position: a bookmark is not a reading move.
 *
 * The on-screen range is read when the view is ready, after each user move and
 * at each scroll end, not per scroll frame, so the ribbon does not flicker at
 * the screen's edges.
 */
export function useReaderBookmarks(bookId: string, readerApi: ReaderApi, isViewReady: boolean) {
	const { data: bookmarks = NO_BOOKMARKS } = queryHooks.useBookmarks(bookId);
	const { mutate: toggleOnScreen } = queryHooks.useToggleBookmark();
	const [visible, setVisible] = useState<VisibleWords | null>(null);

	useEffect(() => {
		if (!isViewReady) return;
		let frame = 0;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const read = () => {
			const next = readerApi.visibleWords();
			setVisible((prev) => (sameRange(prev, next) ? prev : next));
		};
		const schedule = () => {
			cancelAnimationFrame(frame);
			clearTimeout(timer);
			frame = requestAnimationFrame(read);
			timer = setTimeout(read, RELAYOUT_MS);
		};
		schedule();
		const unsubscribe = readerApi.onUserNavigate(schedule);
		// A far jump lands after the relayout read, inside the jump's settle guard,
		// so no user move reports it; its scroll end does. scrollend does not bubble.
		window.addEventListener("scrollend", schedule, true);
		return () => {
			unsubscribe();
			window.removeEventListener("scrollend", schedule, true);
			cancelAnimationFrame(frame);
			clearTimeout(timer);
		};
	}, [readerApi, isViewReady]);

	const toggle = useCallback(() => {
		const onScreen = readerApi.visibleWords();
		if (!onScreen) return;
		setVisible(onScreen);
		toggleOnScreen({ bookId, from: wordPos(onScreen.first), to: wordPos(onScreen.last) });
	}, [readerApi, bookId, toggleOnScreen]);

	const words = useMemo(() => bookmarks.map((b) => b.word), [bookmarks]);
	const goToNext = useCallback(() => {
		const word = nextBookmarkWord(words, readerApi.currentWord());
		if (word !== null) readerApi.goToWord(word);
	}, [words, readerApi]);

	return {
		bookmarks,
		isOnScreen: hasBookmarkOnScreen(bookmarks, visible),
		toggle,
		goToNext,
	};
}
