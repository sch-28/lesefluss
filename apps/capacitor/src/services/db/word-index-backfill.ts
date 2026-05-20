import { WordIndex, wordPos } from "@lesefluss/core";
import { eq } from "drizzle-orm";
import { db } from "./index";
import { queries } from "./queries";
import { books, bookContent, highlights, readingSessions } from "./schema";
import type { Chapter } from "./schema";

export interface BackfillHighlightInput {
	id: string;
	startOffset: number;
	endOffset: number;
}

export interface BackfillSessionInput {
	id: string;
	startPos: number;
	endPos: number;
}

export interface ConvertedHighlight {
	id: string;
	startWord: number;
	startCharInWord: number;
	endWord: number;
	endCharInWord: number;
}

export interface ConvertedSession {
	id: string;
	startWord: number;
	endWord: number;
}

export interface BookConversionInput {
	position: number;
	content: string;
	chapters: Chapter[] | null;
	highlights: readonly BackfillHighlightInput[];
	sessions: readonly BackfillSessionInput[];
}

export interface BookConversionResult {
	wordIndex: WordIndex;
	wordPosition: number;
	chapters: Chapter[] | null;
	highlights: ConvertedHighlight[];
	sessions: ConvertedSession[];
}

/**
 * Pure byte → word conversion for one book. No DB, no IO.
 * Build a WordIndex once and convert every position-bearing record against it.
 *
 * Highlight anchors land on Option A shape (ADR-0002): `endCharInWord` is the
 * char index inside the word that contains `endOffset`, so a selection that
 * ends mid-word is preserved verbatim.
 */
export function computeBookConversion(input: BookConversionInput): BookConversionResult {
	const idx = WordIndex.build(input.content);

	const wordPosition = idx.wordOf(input.position);

	const convertedHighlights: ConvertedHighlight[] = input.highlights.map((h) => {
		const start = idx.wordAndCharOf(h.startOffset);
		const end = idx.wordAndCharOf(h.endOffset);
		return {
			id: h.id,
			startWord: start.word,
			startCharInWord: start.charInWord,
			endWord: end.word,
			endCharInWord: end.charInWord,
		};
	});

	const convertedSessions: ConvertedSession[] = input.sessions.map((s) => ({
		id: s.id,
		startWord: idx.wordOf(s.startPos),
		endWord: idx.wordOf(s.endPos),
	}));

	const convertedChapters: Chapter[] | null = input.chapters
		? input.chapters.map((c) => ({ ...c, startWord: idx.wordOf(c.startByte) }))
		: null;

	return {
		wordIndex: idx,
		wordPosition,
		chapters: convertedChapters,
		highlights: convertedHighlights,
		sessions: convertedSessions,
	};
}

/**
 * Serialize a WordIndex for the `book_content.word_index` blob column.
 * UTF-8 JSON. Decoded with the same encoding on read.
 */
export function serializeWordIndexBlob(idx: WordIndex): Uint8Array {
	const json = JSON.stringify(idx.serialize());
	return new TextEncoder().encode(json);
}

/**
 * Drizzle's `blob({ mode: "buffer" })` types the column as `Buffer`, but the
 * sqlite-proxy runtime accepts any byte-array-shaped value. We produce
 * Uint8Array (browser-native, no Node polyfill) and bridge the type here.
 */
function toBlobValue(bytes: Uint8Array): Buffer {
	return bytes as unknown as Buffer;
}

/**
 * Per-book DB orchestration. Idempotent: a book already marked `position_unit
 * = 'word'` is skipped. Pending / locked / error chapters are skipped (no
 * content row to tokenize). Position_unit flips LAST so a crash mid-pass
 * leaves the book in a re-runnable state.
 */
export async function backfillBookToWord(bookId: string): Promise<"converted" | "skipped"> {
	const book = await queries.getBook(bookId);
	if (!book) return "skipped";
	if (book.positionUnit === "word") return "skipped";
	if (book.chapterStatus !== "fetched") return "skipped";

	const contentRow = await queries.getBookContent(bookId);
	if (!contentRow?.content) return "skipped";

	const [bookHighlights, bookSessions] = await Promise.all([
		queries.getHighlightsByBook(bookId),
		queries.getReadingSessionsByBook(bookId),
	]);

	const chapters = queries.parseChapters(contentRow.chapters);

	const result = computeBookConversion({
		position: book.position,
		content: contentRow.content,
		chapters: chapters.length > 0 ? chapters : null,
		highlights: bookHighlights.map((h) => ({
			id: h.id,
			startOffset: h.startOffset,
			endOffset: h.endOffset,
		})),
		sessions: bookSessions.map((s) => ({
			id: s.id,
			startPos: s.startPos,
			endPos: s.endPos,
		})),
	});

	const blob = toBlobValue(serializeWordIndexBlob(result.wordIndex));

	await db
		.update(bookContent)
		.set({
			wordIndex: blob,
			chapters: result.chapters ? JSON.stringify(result.chapters) : contentRow.chapters,
		})
		.where(eq(bookContent.bookId, bookId));

	// Highlight + session updates are independent of each other and of the
	// bookContent write above — kick both groups off in parallel.
	await Promise.all([
		...result.highlights.map((h) =>
			db
				.update(highlights)
				.set({
					startWord: h.startWord,
					startCharInWord: h.startCharInWord,
					endWord: h.endWord,
					endCharInWord: h.endCharInWord,
				})
				.where(eq(highlights.id, h.id)),
		),
		...result.sessions.map((s) =>
			db
				.update(readingSessions)
				.set({ startWord: s.startWord, endWord: s.endWord })
				.where(eq(readingSessions.id, s.id)),
		),
	]);

	// Flip position_unit last — a crash anywhere above leaves the book still
	// flagged 'byte' and the next sweep redoes the work (idempotent).
	await db
		.update(books)
		.set({ wordPosition: result.wordPosition, positionUnit: "word" })
		.where(eq(books.id, bookId));

	return "converted";
}

export interface BackfillProgress {
	done: number;
	total: number;
}

export interface BackfillSummary {
	converted: number;
	skipped: number;
}

/**
 * Iterate every book that still reads as `position_unit = 'byte'` and convert
 * it. Caller passes a progress callback to drive a blocking UI.
 *
 * Crash recovery: filter runs fresh on every call, so any books already
 * flipped to 'word' are excluded automatically.
 */
export async function backfillAllBooks(
	onProgress?: (progress: BackfillProgress) => void,
): Promise<BackfillSummary> {
	const all = await queries.getAllBooks();
	const pending = all.filter(
		(b) => b.positionUnit === "byte" && b.chapterStatus === "fetched" && !b.deleted,
	);
	const total = pending.length;

	let converted = 0;
	let skipped = 0;
	let done = 0;

	onProgress?.({ done, total });

	for (const book of pending) {
		const outcome = await backfillBookToWord(book.id);
		if (outcome === "converted") converted++;
		else skipped++;
		done++;
		onProgress?.({ done, total });
	}

	return { converted, skipped };
}

// Re-export WordPosition factory for callers that need to mint typed positions
// from raw integer columns until the switchover (TASK-135) lands.
export { wordPos };
