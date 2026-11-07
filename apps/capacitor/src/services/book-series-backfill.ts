import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { type OpfSeries, readOpfSeries } from "@lesefluss/book-import/parsers/opf-series";
import JSZip from "jszip";
import { log } from "../utils/log";
import { readOriginalFile } from "./book-import/sources/read-file";
import { bookKeys } from "./db/hooks/query-keys";
import { queries } from "./db/queries";
import { queryClient } from "./query-client";
import { scheduleSeriesReconcile } from "./series-collections";
import { scheduleSyncPush } from "./sync";
import { reportEvent } from "./telemetry";

const STATE_KEY = "bookSeriesBackfill.state";
const CURSOR_KEY = "bookSeriesBackfill.cursor";
const BATCH_SIZE = 20;
// Leaves the main thread to the library and the reader between two books.
const PAUSE_MS = 250;
// Lets the library finish its first render before any EPUB is opened.
const START_DELAY_MS = 5000;

export type SeriesBackfillCounts = { filled: number; noSeries: number; failed: number };

export type SeriesBackfillDeps = {
	isDone: () => Promise<boolean>;
	readCursor: () => Promise<string | null>;
	saveCursor: (bookId: string) => Promise<void>;
	markDone: () => Promise<void>;
	candidates: (
		afterId: string | null,
		limit: number,
	) => Promise<{ id: string; filePath: string }[]>;
	readSeries: (filePath: string) => Promise<OpfSeries>;
	fill: (bookId: string, series: OpfSeries) => Promise<void>;
	pause: () => Promise<void>;
};

/**
 * Reads the book-level series from every stored EPUB that has none, once per
 * device. The cursor is saved after each book, so a run cut short resumes
 * where it stopped. Returns null when the backfill already ran.
 */
export async function runSeriesBackfill(
	deps: SeriesBackfillDeps,
): Promise<SeriesBackfillCounts | null> {
	if (await deps.isDone()) return null;
	const counts: SeriesBackfillCounts = { filled: 0, noSeries: 0, failed: 0 };
	let cursor = await deps.readCursor();
	for (;;) {
		const batch = await deps.candidates(cursor, BATCH_SIZE);
		if (batch.length === 0) break;
		for (const book of batch) {
			await deps.pause();
			try {
				const series = await deps.readSeries(book.filePath);
				if (series.seriesName) {
					await deps.fill(book.id, series);
					counts.filled++;
				} else {
					counts.noSeries++;
				}
			} catch (err) {
				counts.failed++;
				log.warn("db", `series backfill skipped ${book.id}:`, err);
			}
			cursor = book.id;
			await deps.saveCursor(cursor);
		}
	}
	await deps.markDone();
	return counts;
}

export async function readEpubSeries(bytes: ArrayBuffer): Promise<OpfSeries> {
	const zip = await JSZip.loadAsync(bytes);
	const container = await zip.file("META-INF/container.xml")?.async("string");
	if (!container) throw new Error("EPUB_NO_CONTAINER");
	const doc = new DOMParser().parseFromString(container, "application/xml");
	const opfPath = doc.getElementsByTagName("rootfile")[0]?.getAttribute("full-path");
	const opf = opfPath ? await zip.file(decodeURI(opfPath))?.async("string") : undefined;
	if (!opf) throw new Error("EPUB_NO_OPF");
	return readOpfSeries(opf);
}

const nativeDeps: SeriesBackfillDeps = {
	isDone: async () => (await Preferences.get({ key: STATE_KEY })).value === "done",
	readCursor: async () => (await Preferences.get({ key: CURSOR_KEY })).value,
	saveCursor: (bookId) => Preferences.set({ key: CURSOR_KEY, value: bookId }),
	markDone: async () => {
		await Preferences.set({ key: STATE_KEY, value: "done" });
		await Preferences.remove({ key: CURSOR_KEY });
	},
	candidates: queries.getSeriesBackfillCandidates,
	readSeries: async (filePath) => readEpubSeries(await readOriginalFile(filePath)),
	fill: queries.fillEmptyBookSeries,
	pause: () => new Promise((resolve) => setTimeout(resolve, PAUSE_MS)),
};

let started = false;

/** Android only (LESE-125.17). */
export function startSeriesBackfill(deps: SeriesBackfillDeps = nativeDeps): void {
	if (started || Capacitor.getPlatform() !== "android") return;
	started = true;
	setTimeout(() => void runAndReport(deps), START_DELAY_MS);
}

async function runAndReport(deps: SeriesBackfillDeps): Promise<void> {
	await runSeriesBackfill(deps)
		.then(async (counts) => {
			if (!counts) return;
			reportEvent("series_backfill", { extra: counts });
			if (counts.filled === 0) return;
			log("db", `series backfill filled ${counts.filled} books`);
			scheduleSyncPush();
			await queryClient.invalidateQueries({ queryKey: bookKeys.all });
			await scheduleSeriesReconcile();
		})
		.catch((err) => log.warn("db", "series backfill failed:", err));
}
