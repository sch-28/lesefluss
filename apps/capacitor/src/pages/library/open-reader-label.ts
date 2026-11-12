import type { Chapter } from "../../services/db/schema";
import { currentChapterIndex, hasWordAlignedChapters } from "../../utils/chapters";
import { formatReadingTime } from "../../utils/reading-time";

/**
 * The detail page's main button: "Continue · <time> left" once a book is started, with the
 * current chapter as `detail`, which the button drops where it would be cut off.
 */
export function openReaderLabel(
	book: { wordPosition: number; wordCount: number; finishedAt: number | null },
	chapters: Chapter[],
	minutesLeft: number | null,
): { label: string; detail?: string } {
	if (book.finishedAt !== null) return { label: "Open reader" };
	if (book.wordPosition <= 0) return { label: "Start reading" };
	const chapter = hasWordAlignedChapters(chapters, book.wordCount)
		? chapters[currentChapterIndex(chapters, book.wordPosition)]?.title
		: undefined;
	const label = minutesLeft ? `Continue · ${formatReadingTime(minutesLeft)} left` : "Continue";
	return chapter ? { label, detail: chapter } : { label };
}
