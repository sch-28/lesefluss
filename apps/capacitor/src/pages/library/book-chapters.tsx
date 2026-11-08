import type { WordPosition } from "@lesefluss/core";
import { useState } from "react";
import type { Chapter } from "../../services/db/schema";
import { currentChapterIndex, hasWordAlignedChapters } from "../../utils/chapters";

/** Rows shown before "Show all": context around the current chapter, in the
 *  page's own scroll, since a list scrolling inside the page traps the thumb. */
export const COLLAPSED_CHAPTERS = 6;

/** The window of rows shown collapsed: one before the current chapter, the rest after. */
export function collapsedRange(count: number, currentIndex: number): [number, number] {
	if (count <= COLLAPSED_CHAPTERS) return [0, count];
	const start = Math.min(Math.max(0, currentIndex - 1), count - COLLAPSED_CHAPTERS);
	return [start, start + COLLAPSED_CHAPTERS];
}
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
	isResolved,
}: {
	chapters: Chapter[];
	wordCount: number;
	wordPosition: WordPosition;
	onJump: (startWord: number) => void;
	/** False while the chapter starts may still be one word early (see useBookChapters). */
	isResolved: boolean;
}) {
	const [isExpanded, setIsExpanded] = useState(false);

	// Titles are still worth showing when the offsets are legacy byte positions,
	// but jumping on them would write a nonsense reading position, and the
	// "here" marker would point at the wrong chapter.
	const isWordAligned = hasWordAlignedChapters(chapters, wordCount);
	const canJump = isWordAligned && isResolved;
	const currentIndex = isWordAligned ? currentChapterIndex(chapters, wordPosition) : -1;

	if (chapters.length === 0) return null;
	const [from, to] = isExpanded
		? [0, chapters.length]
		: collapsedRange(chapters.length, Math.max(0, currentIndex));

	return (
		<section className="book-detail-card mt-4">
			<h2 className="book-detail-section-title">
				Chapters <span className="font-normal opacity-50">· {chapters.length}</span>
			</h2>
			<ol className="mt-3 space-y-0.5">
				{chapters.slice(from, to).map((chapter, offset) => {
					const index = from + offset;
					const isCurrent = index === currentIndex;
					return (
						<li key={`${chapter.startWord}-${chapter.title}`}>
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
			{chapters.length > COLLAPSED_CHAPTERS && (
				<button
					type="button"
					onClick={() => setIsExpanded((v) => !v)}
					className="mt-2 h-9 rounded-md px-1 text-primary text-sm"
				>
					{isExpanded ? "Show fewer" : `Show all ${chapters.length} chapters`}
				</button>
			)}
		</section>
	);
}
