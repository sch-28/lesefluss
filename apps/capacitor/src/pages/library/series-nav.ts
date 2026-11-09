import { bookStatus, hasRealProgress } from "@lesefluss/core";
import type { CollectionWithCount, SeriesMembership } from "../../services/db/queries/collections";
import type { SeriesActivity } from "../../services/db/queries/series";
import type { Book, Series } from "../../services/db/schema";
import { compareText } from "./sort-filter";

export const SIDEBAR_SERIES_LIMIT = 5;

export type SeriesKind = "book" | "serial";

/** A book series (a series collection) or a serial web novel, as the Series lists show it. */
export type SeriesEntry = {
	kind: SeriesKind;
	id: string;
	name: string;
	author: string | null;
	/** Books in a book series, chapters in a serial. */
	count: number;
	started: number;
	finished: number;
	lastRead: number | null;
	/** Up to three book ids (book series, in #N order) whose covers stand for the series. */
	coverBookIds: string[];
	coverImage: string | null;
};

export type SeriesSort = "last-read" | "name" | "size";
export type SeriesKindFilter = "all" | SeriesKind;

export type SeriesSources = {
	collections: readonly CollectionWithCount[];
	seriesMemberships: ReadonlyMap<string, readonly SeriesMembership[]>;
	books: readonly Book[];
	serials: readonly Series[];
	chapterCounts: ReadonlyMap<string, number>;
	serialActivity: ReadonlyMap<string, SeriesActivity>;
};

type Member = { book: Book; seriesIndex: number | null };

function byIndex(a: Member, b: Member): number {
	if (a.seriesIndex === null || b.seriesIndex === null) {
		return a.seriesIndex === b.seriesIndex ? 0 : a.seriesIndex === null ? 1 : -1;
	}
	return a.seriesIndex - b.seriesIndex;
}

function mostCommon(values: readonly (string | null)[]): string | null {
	const counts = new Map<string, number>();
	let best: string | null = null;
	for (const v of values) {
		if (!v) continue;
		const n = (counts.get(v) ?? 0) + 1;
		counts.set(v, n);
		if (best === null || n > (counts.get(best) ?? 0)) best = v;
	}
	return best;
}

/** Every series with at least one book or chapter, by last read. Empty series stay hidden. */
export function buildSeriesEntries(src: SeriesSources): SeriesEntry[] {
	const membersOf = new Map<string, Member[]>();
	for (const book of src.books) {
		for (const m of src.seriesMemberships.get(book.id) ?? []) {
			const list = membersOf.get(m.collectionId);
			const member = { book, seriesIndex: m.seriesIndex };
			if (list) list.push(member);
			else membersOf.set(m.collectionId, [member]);
		}
	}

	const entries: SeriesEntry[] = [];
	for (const c of src.collections) {
		if (c.seriesKey === null || c.bookCount === 0) continue;
		const members = (membersOf.get(c.id) ?? []).sort(byIndex);
		let lastRead: number | null = null;
		for (const { book } of members) {
			if (book.lastRead !== null && (lastRead === null || book.lastRead > lastRead)) {
				lastRead = book.lastRead;
			}
		}
		entries.push({
			kind: "book",
			id: c.id,
			name: c.name,
			author: mostCommon(members.map((m) => m.book.author)),
			count: c.bookCount,
			started: members.filter((m) => hasRealProgress(m.book)).length,
			// bookStatus, as the series page counts its finished books.
			finished: members.filter((m) => bookStatus(m.book) === "finished").length,
			lastRead,
			coverBookIds: members.slice(0, 3).map((m) => m.book.id),
			coverImage: null,
		});
	}
	for (const s of src.serials) {
		const count = src.chapterCounts.get(s.id) ?? 0;
		if (count === 0) continue;
		const activity = src.serialActivity.get(s.id);
		entries.push({
			kind: "serial",
			id: s.id,
			name: s.title,
			author: s.author,
			count,
			started: activity?.started ?? 0,
			finished: activity?.finished ?? 0,
			lastRead: activity?.latestRead ?? null,
			coverBookIds: [],
			coverImage: s.coverImage,
		});
	}
	return sortSeriesEntries(entries, "last-read");
}

export function sortSeriesEntries(
	entries: readonly SeriesEntry[],
	sort: SeriesSort,
): SeriesEntry[] {
	const byName = (a: SeriesEntry, b: SeriesEntry) => compareText(a.name, b.name);
	return [...entries].sort((a, b) => {
		if (sort === "size") return b.count - a.count || byName(a, b);
		if (sort === "last-read") {
			if (a.lastRead !== b.lastRead) {
				if (a.lastRead === null) return 1;
				if (b.lastRead === null) return -1;
				return b.lastRead - a.lastRead;
			}
		}
		return byName(a, b);
	});
}

export function filterSeriesEntries(
	entries: readonly SeriesEntry[],
	opts: { query: string; kind: SeriesKindFilter; sort: SeriesSort },
): SeriesEntry[] {
	const q = opts.query.trim().toLocaleLowerCase();
	const kept = entries.filter(
		(e) =>
			(opts.kind === "all" || e.kind === opts.kind) &&
			(q === "" || e.name.toLocaleLowerCase().includes(q)),
	);
	return sortSeriesEntries(kept, opts.sort);
}

export function seriesEntryKey(e: Pick<SeriesEntry, "kind" | "id">): string {
	return `${e.kind}:${e.id}`;
}

export function countLabel(e: Pick<SeriesEntry, "kind" | "count">): string {
	if (e.kind === "serial") return e.count === 1 ? "1 chapter" : `${e.count} chapters`;
	return e.count === 1 ? "1 book" : `${e.count} books`;
}

export function progressLabel(e: Pick<SeriesEntry, "started" | "finished">): string {
	if (e.finished > 0) return `${e.finished} finished`;
	return e.started > 0 ? `${e.started} started` : "New";
}

export function seriesSummary(entries: readonly Pick<SeriesEntry, "kind">[]): string {
	const serials = entries.filter((e) => e.kind === "serial").length;
	const books = entries.length - serials;
	const parts = [
		books > 0 && `${books} book series`,
		serials > 0 && `${serials} ${serials === 1 ? "serial" : "serials"}`,
	].filter(Boolean);
	return parts.length > 0 ? `${entries.length} · ${parts.join(", ")}` : "No series yet";
}
