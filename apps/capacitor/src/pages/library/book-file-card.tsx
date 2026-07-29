import type { Book } from "../../services/db/schema";
import { formatRelative } from "../../utils/date-utils";
import { formatBytes } from "./transfer-modal/utils";

/**
 * Facts about the file itself.
 *
 * The shell's "About" card needs a catalog description, which only books
 * imported from Gutenberg or Standard Ebooks have. A sideloaded EPUB gets
 * nothing, which is most of a real library. This fills that gap with what the
 * import already recorded.
 */
export function BookFileCard({ book, chapterCount }: { book: Book; chapterCount: number }) {
	const rows: Array<[string, string]> = [
		["Format", book.fileFormat.toUpperCase()],
		["Length", `${book.wordCount.toLocaleString()} words`],
	];
	if (chapterCount > 0) rows.push(["Chapters", String(chapterCount)]);
	if (book.size > 0) rows.push(["Size", formatBytes(book.size)]);
	rows.push(["Added", formatRelative(book.addedAt)]);
	if (book.finishedAt != null) rows.push(["Finished", formatRelative(book.finishedAt)]);
	rows.push(["Source", describeSource(book)]);

	return (
		<section className="book-detail-card mt-4">
			<h2 className="book-detail-section-title">About this file</h2>
			<dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
				{rows.map(([label, value]) => (
					<div key={label} className="flex items-baseline justify-between gap-2">
						<dt className="text-muted-foreground text-xs">{label}</dt>
						<dd className="truncate text-right font-medium">{value}</dd>
					</div>
				))}
			</dl>
		</section>
	);
}

function describeSource(book: Book): string {
	switch (book.source) {
		case "gutenberg":
			return "Project Gutenberg";
		case "standard_ebooks":
			return "Standard Ebooks";
		case "url":
			return "Web page";
		case "serial":
			return "Serial";
		default:
			return "Imported file";
	}
}
