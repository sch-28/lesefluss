import type { Chapter } from "../../services/db/schema";
import { currentChapterIndex, hasWordAlignedChapters } from "../../utils/chapters";
import { formatReadingTime } from "../../utils/reading-time";

/** The detail page's main button: "Continue · <chapter> · <time> left" once a book is started. */
export function openReaderLabel(
	book: { wordPosition: number; wordCount: number; finishedAt: number | null },
	chapters: Chapter[],
	minutesLeft: number | null,
): string {
	if (book.finishedAt !== null) return "Open reader";
	if (book.wordPosition <= 0) return "Start reading";
	const chapter = hasWordAlignedChapters(chapters, book.wordCount)
		? (chapters[currentChapterIndex(chapters, book.wordPosition)]?.title ?? null)
		: null;
	const left = minutesLeft ? `${formatReadingTime(minutesLeft)} left` : null;
	return ["Continue", chapter, left].filter((part) => part).join(" · ");
}
