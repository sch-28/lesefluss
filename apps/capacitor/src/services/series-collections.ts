import {
	BOOK_SERIES_INDEX_MAX,
	COLLECTION_NAME_MAX,
	normalizeSeriesKey,
	seriesCollectionId,
} from "@lesefluss/core";
import { log } from "../utils/log";
import type { ImportSeriesChoice } from "./book-import/types";
import { collectionKeys } from "./db/hooks/query-keys";
import { queries } from "./db/queries";
import { type ImportSeriesState, isEmptiedSeries } from "./db/queries/collections";
import type { Collection, CollectionBook } from "./db/schema";
import { queryClient } from "./query-client";
import { serverNow } from "./sync/server-clock";

export interface SeriesHintBook {
	id: string;
	addedAt: number;
	seriesName: string | null;
	seriesIndex: number | null;
}

/** Older than any real write; nonzero so it reads as a stamp, not a missing one. */
export const AUTO_STAMP = 1;

export interface SeriesReconcilePlan {
	collections: Collection[];
	memberships: CollectionBook[];
}

/**
 * Which series collections and memberships are missing for the books' series
 * hints. A key is created once two live books share it; an existing collection
 * is joined by any book with its key. Any row that already exists is left
 * alone, tombstones included: a deleted series collection or a removed book is
 * the user's dismissal and is never re-added, nor counted towards the two books.
 * The one exception is a series deleted because its last book left
 * (`isEmptiedSeries`): it forms again like a new one.
 *
 * Auto rows carry `AUTO_STAMP` as their revision, so every user edit on any
 * device beats them, a dismissal included that this device has not pulled yet.
 * Devices that plan the same series offline write rows with equal stamps; the
 * first one the server stores is kept. A re-formed series is stamped just past
 * its tombstone, so it beats the deletion and loses to any later edit.
 */
export function planSeriesReconcile(input: {
	books: SeriesHintBook[];
	collections: Collection[];
	memberships: CollectionBook[];
	now: number;
}): SeriesReconcilePlan {
	const byKey = new Map<string, SeriesHintBook[]>();
	for (const book of input.books) {
		const key = normalizeSeriesKey(book.seriesName);
		if (!key) continue;
		const group = byKey.get(key);
		if (group) group.push(book);
		else byKey.set(key, [book]);
	}
	const existing = new Map(input.collections.map((c) => [c.id, c]));
	const members = new Set(input.memberships.map((m) => memberKey(m.collectionId, m.bookId)));
	const dismissed = new Set(
		input.memberships.filter((m) => m.deleted).map((m) => memberKey(m.collectionId, m.bookId)),
	);

	const plan: SeriesReconcilePlan = { collections: [], memberships: [] };
	for (const [key, group] of byKey) {
		const id = seriesCollectionId(key);
		const tombstone = existing.get(id);
		const collection = tombstone && isEmptiedSeries(tombstone) ? undefined : tombstone;
		if (collection?.deleted) continue;
		if (!collection) {
			const founders = group
				.filter((book) => !dismissed.has(memberKey(id, book.id)))
				.sort((a, b) => a.addedAt - b.addedAt || a.id.localeCompare(b.id));
			if (founders.length < 2) continue;
			const created = Math.min(founders[0].addedAt, input.now);
			plan.collections.push({
				id,
				name: (founders[0].seriesName?.trim() || key).slice(0, COLLECTION_NAME_MAX),
				sortOrder: created,
				ordered: true,
				seriesKey: key,
				deleted: false,
				createdAt: created,
				updatedAt: tombstone ? tombstone.updatedAt + 1 : AUTO_STAMP,
			});
		}
		for (const book of group) {
			if (members.has(memberKey(id, book.id))) continue;
			plan.memberships.push({
				collectionId: id,
				bookId: book.id,
				seriesIndex: validSeriesIndex(book.seriesIndex),
				position: null,
				deleted: false,
				updatedAt: AUTO_STAMP,
			});
		}
	}
	return plan;
}

function validSeriesIndex(index: number | null): number | null {
	if (index === null || !Number.isFinite(index)) return null;
	return index >= 0 && index <= BOOK_SERIES_INDEX_MAX ? index : null;
}

function memberKey(collectionId: string, bookId: string): string {
	return `${collectionId}\u0000${bookId}`;
}

export type ImportSeriesStatus =
	| { kind: "joins"; name: string; bookCount: number }
	| { kind: "starts"; withTitle: string }
	| { kind: "waits" }
	| { kind: "dismissed" };

/** The series an import's file names, and what keeping it would do. */
export type DetectedSeries = {
	collectionId: string;
	/** As the file spells it. */
	name: string;
	index: number | null;
	status: ImportSeriesStatus;
};

export type SeriesHint = { seriesName: string | null; seriesIndex: number | null };

/** Null when the file names no usable series. */
export function describeImportSeries(
	hint: SeriesHint,
	state: ImportSeriesState,
): DetectedSeries | null {
	const key = normalizeSeriesKey(hint.seriesName);
	if (!key || !hint.seriesName) return null;
	const detected = {
		collectionId: seriesCollectionId(key),
		name: hint.seriesName.trim(),
		index: validSeriesIndex(hint.seriesIndex),
	};
	const { collection, others } = state;
	if (collection?.deleted) return { ...detected, status: { kind: "dismissed" } };
	if (collection) {
		return {
			...detected,
			status: { kind: "joins", name: collection.name, bookCount: collection.bookCount },
		};
	}
	if (others.length > 0) {
		return { ...detected, status: { kind: "starts", withTitle: others[0].title } };
	}
	return { ...detected, status: { kind: "waits" } };
}

/**
 * Writes the Add book page's series choice for a just-inserted book. Runs
 * before the reconcile, which then finds the choice: a membership it keeps, or
 * the dismissal that keeps the book out of the file's series.
 */
export async function applyImportSeriesChoice(
	bookId: string,
	hint: SeriesHint,
	choice: ImportSeriesChoice,
	now = serverNow(),
): Promise<void> {
	const key = normalizeSeriesKey(hint.seriesName);
	const detectedId = key ? seriesCollectionId(key) : null;
	if (
		choice.kind === "detected" ||
		(choice.kind === "collection" && choice.collectionId === detectedId)
	) {
		const index = choice.index;
		// Only a changed #N is written: the reconcile adds the book at the file's number.
		if (detectedId && index !== validSeriesIndex(hint.seriesIndex)) {
			await queries.addBooksToCollection(detectedId, [bookId], now, new Map([[bookId, index]]));
		}
		return;
	}
	if (detectedId) await queries.dismissBookFromCollection(detectedId, bookId, now);
	if (choice.kind === "none") return;

	let collectionId: string;
	let ordered: boolean;
	if (choice.kind === "new") {
		collectionId = (await queries.createCollection(choice.name, now)).id;
		await queries.setCollectionOrdered(collectionId, true, now);
		ordered = true;
	} else {
		collectionId = choice.collectionId;
		ordered = (await queries.getCollections()).some((c) => c.id === collectionId && c.ordered);
	}
	await queries.addBooksToCollection(
		collectionId,
		[bookId],
		now,
		ordered ? new Map([[bookId, choice.index]]) : undefined,
	);
}

export async function reconcileSeriesCollections(): Promise<number> {
	const [books, rows] = await Promise.all([
		queries.getSeriesHintBooks(),
		queries.getSeriesReconcileRows(),
	]);
	const plan = planSeriesReconcile({ books, ...rows, now: serverNow() });
	const inserted = plan.collections.length + plan.memberships.length;
	if (inserted === 0) return 0;
	await queries.insertMissingCollectionRows(plan.collections, plan.memberships);
	log(
		"db",
		`series reconcile: ${plan.collections.length} collection(s), ${plan.memberships.length} membership(s)`,
	);
	await queryClient.invalidateQueries({ queryKey: collectionKeys.all });
	// Lazy: sync imports this module, and the import path must not load sync's window hooks.
	const { scheduleSyncPush } = await import("./sync");
	scheduleSyncPush();
	return inserted;
}

let running: Promise<void> | null = null;
let again = false;

/** Single-flight: a call during a run queues exactly one more run, so no change is missed. */
export function scheduleSeriesReconcile(): Promise<void> {
	if (running) {
		again = true;
		return running;
	}
	running = (async () => {
		try {
			do {
				again = false;
				await reconcileSeriesCollections().catch((err) =>
					log.warn("db", "series reconcile failed:", err),
				);
			} while (again);
		} finally {
			running = null;
		}
	})();
	return running;
}

let started = false;

/** Once per app start: also turns hints synced or imported before series collections existed into collections. */
export function startSeriesReconcile(): void {
	if (started) return;
	started = true;
	void scheduleSeriesReconcile();
}
