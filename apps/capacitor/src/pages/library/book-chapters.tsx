import type { WordPosition } from "@lesefluss/core";
import { useState } from "react";
import { Card } from "@/components/card";
import type { Chapter } from "../../services/db/schema";
import { currentChapterIndex, hasWordAlignedChapters } from "../../utils/chapters";

/** Rows shown before "Show all": context around the current chapter, in the
 *  page's own scroll, since a list scrolling inside the page traps the thumb. */
export const COLLAPSED_CHAPTERS = 6;

/** "3. The Fall", "Chapter 3", "CHAPTER IV.", "Part One": the title already carries the number. */
const SELF_NUMBERED_TITLE =
	/^(\d+\b|(chapter|part|book)\s+(\d+|[ivxlc]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|[a-z]+teen|[a-z]+ty)\b)/i;

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
	const hasStarted = wordPosition > 0;
	const currentIndex = isWordAligned ? currentChapterIndex(chapters, wordPosition) : -1;
	const isSelfNumbered =
		chapters.filter((c) => SELF_NUMBERED_TITLE.test(c.title.trim())).length * 2 >= chapters.length;

	if (chapters.length === 0) return null;
	const [from, to] = isExpanded
		? [0, chapters.length]
		: collapsedRange(chapters.length, Math.max(0, currentIndex));

	return (
		<Card
			className="mt-4"
			title={
				<>
					Chapters <span className="font-normal opacity-50">· {chapters.length}</span>
				</>
			}
		>
			<ol className="space-y-1">
				{chapters.slice(from, to).map((chapter, offset) => {
					const index = from + offset;
					const isCurrent = hasStarted && index === currentIndex;
					return (
						<li key={`${chapter.startWord}-${chapter.title}`}>
							<button
								type="button"
								disabled={!canJump}
								onClick={() => onJump(chapter.startWord)}
								className={`flex w-full items-baseline gap-3 rounded-md px-1 py-1.5 text-left text-sm ${
									canJump ? "active:bg-current/5" : "cursor-default"
								} ${isCurrent ? "font-medium" : "opacity-70"}`}
							>
								{!isSelfNumbered && (
									<span className="w-6 shrink-0 text-right text-2xs tabular-nums opacity-50">
										{index + 1}
									</span>
								)}
								<span className="min-w-0 flex-1 truncate">{chapter.title}</span>
								{isCurrent && (
									<span
										// ui-rules-allow: uppercase-tracked -- the Here badge, not a caption
										className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-2xs text-primary uppercase tracking-wide"
									>
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
					className="h-9 rounded-md px-1 text-primary text-sm"
				>
					{isExpanded ? "Show fewer" : `Show all ${chapters.length} chapters`}
				</button>
			)}
		</Card>
	);
}
