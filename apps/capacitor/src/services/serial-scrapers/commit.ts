import { log } from "../../utils/log";
import { queries } from "../db/queries";
import type { NewBook, NewSeries, Series } from "../db/schema";
import { scheduleSyncPush } from "../sync";
import type { ChapterFetchResult, ChapterRef, SeriesMetadata } from "./types";

/**
 * Single ID writer for the serial-scrapers module. Mirrors `generateBookId`
 * from book-import — co-located here so the "single ID writer per module"
 * boundary stays clean.
 */
function generateId(): string {
	const arr = new Uint8Array(4);
	crypto.getRandomValues(arr);
	return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function buildSeriesRow(meta: SeriesMetadata, now: number): NewSeries & Series {
	return {
		id: generateId(),
		title: meta.title,
		author: meta.author ?? null,
		coverImage: meta.coverImage ?? null,
		description: meta.description ?? null,
		sourceUrl: meta.sourceUrl,
		tocUrl: meta.tocUrl,
		provider: meta.provider,
		lastCheckedAt: now,
		createdAt: now,
		deleted: false,
		updatedAt: now,
	};
}

function buildChapterRow(
	seriesId: string,
	defaultAuthor: string | null,
	seriesSourceUrl: string,
	ch: ChapterRef,
	now: number,
): NewBook {
	return {
		id: generateId(),
		title: ch.title,
		author: defaultAuthor,
		fileFormat: "txt",
		filePath: null,
		size: 0,
		position: 0,
		isActive: false,
		addedAt: now,
		lastRead: null,
		source: "serial",
		catalogId: null,
		sourceUrl: seriesSourceUrl,
		deleted: false,
		seriesId,
		chapterIndex: ch.index,
		chapterSourceUrl: ch.sourceUrl,
		chapterStatus: "pending",
	};
}

/**
 * Insert a series row plus N chapter rows in a single transaction. Sole DB
 * writer for series creation — `pipeline.runSerialImport` is the only caller.
 */
export async function commitSeries(meta: SeriesMetadata, chapters: ChapterRef[]): Promise<Series> {
	const now = Date.now();
	const seriesRow = buildSeriesRow(meta, now);
	const chapterRows = chapters.map((ch) =>
		buildChapterRow(seriesRow.id, meta.author ?? null, meta.sourceUrl, ch, now),
	);

	await queries.addSeriesWithChapters(seriesRow, chapterRows);

	scheduleSyncPush();
	log(
		"serial-scrapers",
		`series ${seriesRow.id} (${meta.provider}) created with ${chapters.length} chapters`,
	);
	return seriesRow;
}

/**
 * Apply a chapter fetch result to its book row. Exhaustively narrows the
 * discriminated union — adding a new status variant fails the switch at compile
 * time.
 */
export async function commitChapter(chapterId: string, result: ChapterFetchResult): Promise<void> {
	const now = Date.now();

	switch (result.status) {
		case "fetched": {
			const size = new TextEncoder().encode(result.content).byteLength;
			await queries.updateBook(chapterId, {
				chapterStatus: "fetched",
				chapterError: null,
				size,
				lastRead: now,
			});
			await queries.setChapterContent(chapterId, result.content);
			scheduleSyncPush();
			return;
		}
		case "locked": {
			await queries.updateBook(chapterId, {
				chapterStatus: "locked",
				chapterError: null,
				lastRead: now,
			});
			scheduleSyncPush();
			return;
		}
		case "error": {
			log.warn("serial-scrapers", `chapter ${chapterId} fetch failed: ${result.reason}`);
			await queries.updateBook(chapterId, {
				chapterStatus: "error",
				chapterError: result.reason,
				lastRead: now,
			});
			return;
		}
	}
}

/**
 * Soft-delete a series and all of its chapter rows (matches `deleteBook`
 * semantics — the tombstone propagates via sync). Sole caller-facing path
 * for series removal.
 */
export async function removeSerial(seriesId: string): Promise<void> {
	await queries.deleteSeries(seriesId);
	scheduleSyncPush();
}

/**
 * Diff the upstream TOC against existing chapter rows and insert any chapters
 * that are new. Reorders existing rows if upstream changed `chapterIndex`.
 * Never deletes rows — user data is preserved even if upstream removes a
 * chapter (deliberate trade-off: authors occasionally un-publish chapters, and
 * silently wiping a chapter the user has read would be surprising).
 *
 * Returns the number of newly inserted chapter rows.
 */
export async function syncChapterList(
	seriesId: string,
	refs: ChapterRef[],
): Promise<{ added: number }> {
	const series = await queries.getSeries(seriesId);
	if (!series) throw new Error("SERIES_MISSING");

	const existing = await queries.getSeriesChapters(seriesId);
	const bySourceUrl = new Map(existing.map((ch) => [ch.chapterSourceUrl, ch]));

	const now = Date.now();
	const newRows: ReturnType<typeof buildChapterRow>[] = [];
	const indexUpdates: Array<{ id: string; newIndex: number }> = [];

	for (const ref of refs) {
		const found = bySourceUrl.get(ref.sourceUrl);
		if (!found) {
			// Brand-new chapter — create a pending placeholder row.
			newRows.push(buildChapterRow(seriesId, series.author ?? null, series.sourceUrl, ref, now));
		} else if (found.chapterIndex !== ref.index) {
			// Chapter already exists but upstream reordered it.
			indexUpdates.push({ id: found.id, newIndex: ref.index });
		}
	}

	if (newRows.length > 0) {
		await queries.insertChapters(newRows);
	}
	for (const { id, newIndex } of indexUpdates) {
		await queries.updateChapterIndex(id, newIndex);
	}

	await queries.updateSeries(seriesId, { lastCheckedAt: now });

	if (newRows.length > 0) {
		scheduleSyncPush();
		log(
			"serial-scrapers",
			`series ${seriesId}: ${newRows.length} new chapter(s) added, ${indexUpdates.length} reordered`,
		);
	}

	return { added: newRows.length };
}
