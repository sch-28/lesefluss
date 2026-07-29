import type { WordPosition } from "@lesefluss/core";
import { useLayoutEffect, useRef } from "react";
import type { Chapter } from "../../services/db/schema";
import { currentChapterIndex, hasWordAlignedChapters } from "../../utils/chapters";

/** Roughly six rows. Tall enough to show context around the current chapter,
 *  short enough that a 130-chapter book does not push the page away. */
const LIST_MAX_HEIGHT = 240;

/**
 * Chapter list with the reader's current chapter marked, and tap to jump.
 *
 * The jump writes `wordPosition` and opens the reader, which is the same pair of
 * steps the reader itself performs on any in-book jump. It deliberately adds no
 * route parameter and no second seeding path: the reader already resumes from
 * the stored position on every open, so this reuses the one path that is
 * exercised constantly rather than introducing a rarely-taken one.
 */
export function BookChapters({
	chapters,
	wordCount,
	wordPosition,
	onJump,
}: {
	chapters: Chapter[];
	wordCount: number;
	wordPosition: WordPosition;
	onJump: (startWord: number) => void;
}) {
	const listRef = useRef<HTMLOListElement>(null);
	const currentRef = useRef<HTMLLIElement>(null);

	// Titles are still worth showing when the offsets are legacy byte positions,
	// but jumping on them would write a nonsense reading position, and the
	// "here" marker would point at the wrong chapter.
	const canJump = hasWordAlignedChapters(chapters, wordCount);
	const currentIndex = canJump ? currentChapterIndex(chapters, wordPosition) : -1;

	// Centre the current chapter by setting scrollTop directly. `scrollIntoView`
	// walks up and scrolls ancestors too, which would drag the whole detail page
	// down to this section every time the book opens.
	//
	// Measured from bounding rects rather than `offsetTop`, which is relative to
	// the nearest positioned ancestor and not to the list. Re-runs when the
	// content query resolves: on first mount there are no chapters and no row to
	// scroll to yet. Layout effect so the list is centred before paint, otherwise
	// a long book flashes at chapter 1 first.
	useLayoutEffect(() => {
		const list = listRef.current;
		const item = currentRef.current;
		if (!list || !item) return;
		const offset = item.getBoundingClientRect().top - list.getBoundingClientRect().top;
		// Already on screen: leave it alone. Otherwise the list yanks itself back
		// to centre after the reader saves a new position, fighting the scroll the
		// reader just performed.
		if (offset >= 0 && offset + item.clientHeight <= list.clientHeight) return;
		list.scrollTop = Math.max(0, list.scrollTop + offset - (list.clientHeight - item.clientHeight) / 2);
	}, [currentIndex, chapters.length]);

	if (chapters.length === 0) return null;

	return (
		<section className="book-detail-card mt-4">
			<h2 className="book-detail-section-title">
				Chapters <span className="font-normal opacity-50">· {chapters.length}</span>
			</h2>
			<ol
				ref={listRef}
				className="mt-3 space-y-0.5 overflow-y-auto overscroll-contain"
				style={{ maxHeight: LIST_MAX_HEIGHT }}
			>
				{chapters.map((chapter, index) => {
					const isCurrent = index === currentIndex;
					return (
						<li
							key={`${chapter.startWord}-${chapter.title}`}
							ref={isCurrent ? currentRef : undefined}
						>
							<button
								type="button"
								disabled={!canJump}
								onClick={() => onJump(chapter.startWord)}
								className={`flex w-full items-baseline gap-2.5 rounded-md px-1 py-1.5 text-left text-sm ${
									canJump ? "active:bg-current/5" : "cursor-default"
								} ${isCurrent ? "font-medium" : "opacity-70"}`}
							>
								<span className="w-6 shrink-0 text-right text-[11px] tabular-nums opacity-50">
									{index + 1}
								</span>
								<span className="min-w-0 flex-1 truncate">{chapter.title}</span>
								{isCurrent && (
									<span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary uppercase tracking-wide">
										Here
									</span>
								)}
							</button>
						</li>
					);
				})}
			</ol>
		</section>
	);
}
