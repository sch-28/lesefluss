import { Preferences } from "@capacitor/preferences";
import {
	isSyncEligible,
	MAX_SYNCED_CONTENT_BYTES,
	MAX_SYNCED_COVER_CHARS,
	MAX_SYNCED_JSON_CHARS,
	pick,
	SYNCED_SETTING_KEYS,
	type SyncBook,
	type SyncGlossaryEntry,
	type SyncHighlight,
	type SyncPayload,
	type SyncReadingSession,
	SyncReadingSessionSchema,
	type SyncResponse,
	type SyncResponseBook,
	type SyncSeries,
	type SyncSettings,
	wordPos,
} from "@lesefluss/core";
import { log } from "../../utils/log";
import { AuthedFetchError, type AuthedFetchOptions, authedFetch } from "../authed-fetch";
import {
	bookKeys,
	glossaryKeys,
	readingSessionKeys,
	serialKeys,
	settingsKeys,
	statsKeys,
} from "../db/hooks/query-keys";
import { queries } from "../db/queries";
import type {
	Book,
	BookContent,
	GlossaryEntry,
	Highlight,
	NewBook,
	ReadingSession,
	Series,
	Settings,
} from "../db/schema";
import { queryClient } from "../query-client";
import { SYNC_URL } from "./auth-client";
import {
	addServerContentIds,
	getServerContentIds,
	setServerContentIds,
} from "./server-content-cache";
import {
	clearToken,
	getSessionPushWatermark,
	getToken,
	isSyncReady,
	LAST_SYNCED_KEY,
	SESSIONS_PUSHED_KEY,
	SYNC_ENABLED,
} from "./session";

export {
	adoptSyncIdentity,
	beginAuthLoginHandoff,
	consumeAuthLoginHandoffState,
	finalizeVerifiedAuthLoginHandoff,
	getLastSynced,
	getToken,
	getUserEmail,
	IS_WEB_BUILD,
	NATIVE_SYNC_ENABLED,
	onSessionLost,
	resetSessionPushWatermark,
	SYNC_ENABLED,
} from "./session";

export async function signOut(): Promise<void> {
	const token = await getToken();
	// Behind the sync lock: a push in flight persists what the server now holds once
	// it resolves, which would write this account's caches straight back after the
	// clear and hand them to whoever signs in next.
	await withSyncLock(clearToken);
	// Server-side invalidation is best-effort: if we're offline or the request
	// fails, the token is gone from this device but stays valid on the server
	// until its TTL expires. Accepted trade-off for immediate UI response.
	if (token && SYNC_URL) {
		void fetch(`${SYNC_URL}/api/auth/sign-out`, {
			method: "POST",
			headers: { Authorization: `Bearer ${token}` },
		}).catch(() => {});
	}
}

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

async function syncFetch(path: string, options?: AuthedFetchOptions): Promise<Response> {
	try {
		return await authedFetch(path, options);
	} catch (err) {
		if (err instanceof AuthedFetchError)
			throw new Error(`Sync failed (${err.status}): ${err.text}`);
		throw err;
	}
}

/**
 * Hard-delete every reading session for the current user on the server.
 * Sessions are append-only with no tombstone column, so the danger-zone
 * "Delete reading stats" flow uses this dedicated endpoint instead of
 * relying on the diff-on-push behaviour used for highlights/glossary.
 */
export async function wipeServerSessions(): Promise<void> {
	if (!(await isSyncReady())) return;
	await syncFetch("/api/sync/wipe-sessions", { method: "POST" });
}

/**
 * Hard-delete a single reading session for the current user on the server.
 * Sessions have no tombstone column, so a plain push would not propagate a
 * deletion: the row would be re-upserted on the next pull. Mirrors
 * `wipeServerSessions` for the per-row case.
 */
export async function deleteServerSession(sessionId: string): Promise<void> {
	if (!(await isSyncReady())) return;
	await syncFetch("/api/sync/delete-session", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ sessionId }),
	});
}

// ---------------------------------------------------------------------------
// Data mappers (Capacitor SQLite → API payload)
// ---------------------------------------------------------------------------

/**
 * Drop a blob the server would reject instead of sending it.
 *
 * An EPUB cover is embedded verbatim as a data URL with no downscale, so a
 * high-resolution one can exceed the schema cap on its own. The whole push is
 * validated in one pass, so sending it would 400 every other row in the batch.
 * A book that syncs without its cover is recoverable; a device that cannot sync
 * at all is not.
 */
function withinSyncLimit(value: string | null, max: number): string | null {
	if (value !== null && value.length > max) {
		log.warn("sync", `dropping oversized field (${value.length} chars, max ${max})`);
		return null;
	}
	return value;
}

export function bookToSync(book: Book, contentData?: BookContent | null): SyncBook {
	return {
		bookId: book.id,
		title: book.title,
		author: book.author,
		fileSize: book.size,
		wordCount: book.wordCount > 0 ? book.wordCount : null,
		wordPosition: book.wordPosition,
		source: book.source,
		catalogId: book.catalogId,
		sourceUrl: book.sourceUrl,
		seriesId: book.seriesId,
		chapterIndex: book.chapterIndex,
		chapterSourceUrl: book.chapterSourceUrl,
		chapterStatus: book.chapterStatus,
		deleted: book.deleted,
		// Chapter rows (seriesId set) are re-derivable from upstream so body
		// content / cover / TOC are skipped to save sync bytes.
		...(contentData && !book.deleted && !book.seriesId
			? {
					content: withinSyncLimit(contentData.content, MAX_SYNCED_CONTENT_BYTES),
					coverImage: withinSyncLimit(contentData.coverImage, MAX_SYNCED_COVER_CHARS),
					chapters: withinSyncLimit(contentData.chapters, MAX_SYNCED_JSON_CHARS),
					linkRanges: withinSyncLimit(contentData.linkRanges, MAX_SYNCED_JSON_CHARS),
				}
			: {}),
		finishedAt: book.finishedAt,
		addedAt: book.addedAt,
		// A tombstone carries no reader-written text, same rule as content above:
		// a deleted book's private notes have no business outliving it on a server.
		...(book.deleted
			? {}
			: {
					description: book.description,
					language: book.language,
					status: book.status,
					rating: book.rating,
					review: book.review,
					tags: book.tags,
					hideFromProfile: book.hideFromProfile,
				}),
		metadataUpdatedAt: book.metadataUpdatedAt,
		updatedAt: book.updatedAt,
	};
}

function seriesToSync(s: Series): SyncSeries {
	return {
		seriesId: s.id,
		title: s.title,
		author: s.author,
		coverImage: s.coverImage,
		description: s.description,
		sourceUrl: s.sourceUrl,
		tocUrl: s.tocUrl,
		provider: s.provider as SyncSeries["provider"],
		lastCheckedAt: s.lastCheckedAt,
		createdAt: s.createdAt,
		deleted: s.deleted,
		updatedAt: s.updatedAt,
	};
}

function settingsToSync(s: Settings): SyncSettings {
	// Cast: SQLite columns widen enum fields to `string`; SyncSettings narrows
	// them to literal unions. Values originate from validated UI/Zod input.
	return { ...pick(s, SYNCED_SETTING_KEYS), updatedAt: s.updatedAt } as SyncSettings;
}

function highlightToSync(h: Highlight): SyncHighlight {
	return {
		highlightId: h.id,
		bookId: h.bookId,
		startWord: h.startWord,
		startCharInWord: h.startCharInWord,
		endWord: h.endWord,
		endCharInWord: h.endCharInWord,
		color: h.color as SyncHighlight["color"],
		note: h.note,
		text: h.text,
		deleted: false,
		createdAt: h.createdAt,
		updatedAt: h.updatedAt,
	};
}

function sessionToSync(s: ReadingSession): SyncReadingSession {
	return {
		sessionId: s.id,
		bookId: s.bookId,
		mode: s.mode,
		startedAt: s.startedAt,
		endedAt: s.endedAt,
		durationMs: s.durationMs,
		wordsRead: s.wordsRead,
		startWord: s.startWord,
		endWord: s.endWord,
		wpmAvg: s.wpmAvg,
		updatedAt: s.updatedAt,
	};
}

function entryToSync(e: GlossaryEntry): SyncGlossaryEntry {
	return {
		entryId: e.id,
		bookId: e.bookId,
		label: e.label,
		notes: e.notes,
		color: e.color,
		hideMarker: e.hideMarker,
		deleted: false,
		createdAt: e.createdAt,
		updatedAt: e.updatedAt,
	};
}

// ---------------------------------------------------------------------------
// Sync lock - prevents concurrent pull/push from racing
// ---------------------------------------------------------------------------

let _syncQueue: Promise<void> = Promise.resolve();

async function withSyncLock(fn: () => Promise<void>): Promise<void> {
	const prev = _syncQueue;
	let resolve: (() => void) | undefined;
	_syncQueue = new Promise((r) => {
		resolve = r;
	});
	try {
		await prev;
		await fn();
	} finally {
		resolve?.();
	}
}

// ---------------------------------------------------------------------------
// Pull (GET /api/sync → merge into local DB)
// ---------------------------------------------------------------------------

function buildBookRowFromServer(
	serverBook: SyncResponseBook,
	chapterStatus: NonNullable<Book["chapterStatus"]>,
): Book {
	return {
		id: serverBook.bookId,
		title: serverBook.title,
		author: serverBook.author ?? null,
		fileFormat: "txt",
		filePath: null,
		size: serverBook.fileSize ?? 0,
		wordPosition: wordPos(serverBook.wordPosition),
		wordCount: serverBook.wordCount ?? 0,
		isActive: false,
		// A row pushed before `addedAt` travelled carries no add date, and the row
		// revision is the closest thing the server holds to one.
		addedAt: serverBook.addedAt ?? serverBook.updatedAt,
		updatedAt: serverBook.updatedAt,
		// A server row written by a client that pre-dates the column has no
		// metadata stamp; fall back to the row revision.
		metadataUpdatedAt: serverBook.metadataUpdatedAt ?? serverBook.updatedAt,
		lastRead: null,
		finishedAt: serverBook.finishedAt ?? null,
		description: serverBook.description ?? null,
		language: serverBook.language ?? null,
		status: serverBook.status ?? null,
		rating: serverBook.rating ?? null,
		review: serverBook.review ?? null,
		tags: serverBook.tags ?? null,
		hideFromProfile: serverBook.hideFromProfile ?? false,
		originKey: serverBook.originKey ?? null,
		source: serverBook.source ?? null,
		catalogId: serverBook.catalogId ?? null,
		sourceUrl: serverBook.sourceUrl ?? null,
		deleted: false,
		seriesId: serverBook.seriesId ?? null,
		chapterIndex: serverBook.chapterIndex ?? null,
		chapterSourceUrl: serverBook.chapterSourceUrl ?? null,
		chapterStatus,
		chapterError: null,
	};
}

/** Revision of the server's reader-editable fields. A row last written by a
 *  client that pre-dates the column has none, so fall back to the row revision. */
function serverMetadataStamp(serverBook: SyncBook): number {
	return serverBook.metadataUpdatedAt ?? serverBook.updatedAt;
}

/**
 * What to write locally when the server's copy of a book we already have is the
 * newer one, or null when it isn't. Pure so the merge rules can be tested
 * without a database.
 *
 * Three independent gates. `updatedAt` is the reading position's revision, which
 * is what every released build takes it to mean, so the position merges on it
 * exactly as before. The reader-editable fields merge on `metadataUpdatedAt`,
 * which is the only stamp an edit moves; that separation is what keeps an older
 * build from mistaking a rating for reading and discarding a newer position. The
 * add date merges on no stamp at all, being a fact rather than a revision: the
 * earliest wins, so a device that restored the library and stamped itself into
 * the date recovers the original from one that still holds it.
 *
 * `undefined` on a metadata field means the pushing client pre-dates that
 * column and is not claiming anything about it; `null` means the reader cleared
 * it. Only the second is written.
 */
export function buildBookMergeUpdate(
	local: Book,
	serverBook: SyncBook,
): Partial<Omit<NewBook, "id">> | null {
	const positionIsNewer = serverBook.updatedAt > local.updatedAt;
	const metadataIsNewer = serverMetadataStamp(serverBook) > local.metadataUpdatedAt;
	const earlierAddedAt =
		serverBook.addedAt != null && serverBook.addedAt < local.addedAt ? serverBook.addedAt : null;
	if (!positionIsNewer && !metadataIsNewer && earlierAddedAt == null) return null;

	const update: Partial<Omit<NewBook, "id">> = {};
	if (earlierAddedAt != null) update.addedAt = earlierAddedAt;
	if (positionIsNewer) {
		update.wordPosition = wordPos(serverBook.wordPosition);
		update.updatedAt = serverBook.updatedAt;
		// Never backwards: `commitChapter` moves `lastRead` without the position,
		// so the server's stamp can trail ours, and a regression here re-sorts the
		// library (`getBooks` orders by `lastRead desc`).
		update.lastRead = Math.max(local.lastRead ?? 0, serverBook.updatedAt);
		// Refresh wordCount when the server has a definitive value so
		// chapter/highlight bounds derived from it stay coherent. Skipping
		// this leaves local count stale after a server-side content refresh.
		if (serverBook.wordCount != null && serverBook.wordCount !== local.wordCount) {
			update.wordCount = serverBook.wordCount;
		}
	}
	if (!metadataIsNewer) return update;
	update.metadataUpdatedAt = serverMetadataStamp(serverBook);
	if (serverBook.title !== local.title) update.title = serverBook.title;
	if (serverBook.author !== local.author) update.author = serverBook.author;
	if (serverBook.description !== undefined) update.description = serverBook.description;
	if (serverBook.language !== undefined) update.language = serverBook.language;
	if (serverBook.status !== undefined) update.status = serverBook.status;
	if (serverBook.rating !== undefined) update.rating = serverBook.rating;
	if (serverBook.review !== undefined) update.review = serverBook.review;
	if (serverBook.tags !== undefined) update.tags = serverBook.tags;
	if (serverBook.hideFromProfile !== undefined) update.hideFromProfile = serverBook.hideFromProfile;
	return update;
}

/** Returns the set of bookIds the server has content for. */
export async function pullSync(): Promise<Set<string>> {
	const serverHasContent = new Set<string>();
	if (!(await isSyncReady())) return serverHasContent;

	await withSyncLock(async () => {
		log("sync", "pulling...");

		// Tell server which books we already have (including local tombstones — server can skip content)
		const localBooks = await queries.getBooksForSync();
		const localBookMap = new Map(localBooks.map((b) => [b.id, b]));

		// Only standalone books carry content the server might omit; chapter rows
		// (seriesId set) and tombstones never have body content stored, so including
		// them in `have` is pointless and bloats the header. Heavy serial readers
		// can have 10k+ chapter rows — large enough to blow past HTTP/2's per-header
		// frame limit and trigger ERR_HTTP2_PROTOCOL_ERROR. (TASK-102)
		const haveHeader = localBooks
			.filter((b) => !b.seriesId && !b.deleted)
			.map((b) => b.id)
			.join(",");
		log("sync", `pull request haveCount=${localBooks.length} haveHeaderBytes=${haveHeader.length}`);

		const res = await syncFetch("/api/sync", {
			headers: { "X-Sync-Have": haveHeader },
		});
		const data: SyncResponse = await res.json();

		// The server tells us outright which books it stores content for. Older
		// servers omit the field; fall back to inferring it per book below.
		const authoritativeContentIds = data.contentBookIds;

		let changed = false;

		// --- Merge series (before books, so chapter rows can FK-reference them) ---
		const localSeries = await queries.getSeriesForSync();
		const localSeriesMap = new Map(localSeries.map((s) => [s.id, s]));

		// seriesId → bookIds index, built once so the tombstone-cascade branch
		// below can drop entries from `localBookMap` in O(chapters) rather than
		// rescanning every local book per tombstoned series. (TASK-102)
		const localBooksBySeries = new Map<string, string[]>();
		for (const b of localBooks) {
			if (!b.seriesId) continue;
			const arr = localBooksBySeries.get(b.seriesId);
			if (arr) arr.push(b.id);
			else localBooksBySeries.set(b.seriesId, [b.id]);
		}

		for (const serverSeries of data.series ?? []) {
			const local = localSeriesMap.get(serverSeries.seriesId);

			if (serverSeries.deleted) {
				// Cascade: drop any local chapter rows for this series (and their
				// content/highlights/glossary). The server cascade-tombstones them on
				// push, but we don't need to keep local tombstones around either.
				// (TASK-102)
				const removedChapters = await queries.hardDeleteChaptersBySeriesId(serverSeries.seriesId);
				if (removedChapters > 0) {
					for (const id of localBooksBySeries.get(serverSeries.seriesId) ?? []) {
						localBookMap.delete(id);
					}
					localBooksBySeries.delete(serverSeries.seriesId);
					changed = true;
				}
				if (local) {
					await queries.hardDeleteSeries(serverSeries.seriesId);
					localSeriesMap.delete(serverSeries.seriesId);
					changed = true;
				}
				continue;
			}

			if (!local) {
				await queries.addSeries({
					id: serverSeries.seriesId,
					title: serverSeries.title,
					author: serverSeries.author,
					coverImage: serverSeries.coverImage ?? null,
					description: serverSeries.description,
					sourceUrl: serverSeries.sourceUrl,
					tocUrl: serverSeries.tocUrl,
					provider: serverSeries.provider,
					lastCheckedAt: serverSeries.lastCheckedAt,
					createdAt: serverSeries.createdAt,
					deleted: false,
					updatedAt: serverSeries.updatedAt,
				});
				localSeriesMap.set(serverSeries.seriesId, {
					id: serverSeries.seriesId,
					title: serverSeries.title,
					author: serverSeries.author,
					coverImage: serverSeries.coverImage ?? null,
					description: serverSeries.description,
					sourceUrl: serverSeries.sourceUrl,
					tocUrl: serverSeries.tocUrl,
					provider: serverSeries.provider,
					lastCheckedAt: serverSeries.lastCheckedAt,
					createdAt: serverSeries.createdAt,
					deleted: false,
					updatedAt: serverSeries.updatedAt,
				});
				changed = true;
				continue;
			}

			// Local tombstone awaiting push: don't resurrect.
			if (local.deleted) continue;

			if (serverSeries.updatedAt > local.updatedAt) {
				await queries.updateSeries(serverSeries.seriesId, {
					title: serverSeries.title,
					author: serverSeries.author,
					coverImage: serverSeries.coverImage ?? null,
					description: serverSeries.description,
					tocUrl: serverSeries.tocUrl,
					lastCheckedAt: serverSeries.lastCheckedAt,
					updatedAt: serverSeries.updatedAt,
				});
				changed = true;
			}
		}

		// --- Merge books ---
		// Chapter rows from the server never carry content (bookToSync/server both suppress it),
		// so inserting them via addBookWithContent one-by-one wastes 2N sequential DB round-trips.
		// Buffer them here and bulk-insert below after the loop — same chunk strategy as
		// addSeriesWithChapters. Standalone books with real content still use addBookWithContent.
		const newChapterRows: Book[] = [];

		for (const serverBook of data.books) {
			const local = localBookMap.get(serverBook.bookId);

			// Server tombstone: hard-delete locally if present, then move on (no content needed).
			if (serverBook.deleted) {
				if (local) {
					await queries.hardDeleteBook(serverBook.bookId);
					localBookMap.delete(serverBook.bookId);
					changed = true;
				}
				continue;
			}

			// Fallback inference for servers that don't report `contentBookIds`. Only
			// applies to standalone books: chapter rows are intentionally contentless in
			// sync payloads, and marking them content-present would suppress future
			// standalone uploads if schemas ever drift. Note this can only ever add ids:
			// it treats "the server has a row and so do I" as proof the content is there,
			// which is why the authoritative list is preferred.
			if (
				!authoritativeContentIds &&
				!serverBook.seriesId &&
				(serverBook.content || localBookMap.has(serverBook.bookId))
			) {
				serverHasContent.add(serverBook.bookId);
			}

			if (!local) {
				// New book from server. Add if we have content, OR if it's a serial chapter
				// (pending chapters have empty content but still need a row to drive the UI).
				// Don't resurrect chapter rows for series the user has deleted locally
				// (or that don't exist locally because we cascaded). Without this, an
				// older server that hasn't cascade-tombstoned its chapter rows yet would
				// keep refilling the local DB. (TASK-102)
				if (serverBook.seriesId) {
					const parentSeries = localSeriesMap.get(serverBook.seriesId);
					if (!parentSeries || parentSeries.deleted) continue;
				}
				const isChapter = !!serverBook.seriesId;
				if (serverBook.content || isChapter) {
					const chapterStatus =
						isChapter && !serverBook.content ? "pending" : (serverBook.chapterStatus ?? "fetched");
					const row = buildBookRowFromServer(serverBook, chapterStatus);

					if (isChapter && !serverBook.content) {
						// Buffer for batch insert; no content to store. Map updated after flush
						// so it only references rows that actually committed.
						newChapterRows.push(row);
					} else {
						// Standalone book with content (or rare: chapter that carries content).
						await queries.addServerBookWithContent(
							row,
							serverBook.content ?? "",
							serverBook.coverImage,
							serverBook.chapters ?? null,
							serverBook.linkRanges ?? null,
						);
						localBookMap.set(serverBook.bookId, row);
					}
					changed = true;
				}
				continue;
			}

			// Local tombstone awaiting push: don't let server data resurrect or bump it.
			// Remove from the local map so highlights for this book aren't merged either.
			if (local.deleted) {
				localBookMap.delete(serverBook.bookId);
				continue;
			}

			// Independent of the updatedAt gate: a finish recorded on another device
			// is a fact this one lacks, and it does not move the reading position.
			// The server already holds it, so claiming a newer revision here would
			// only shadow whatever else it has for us.
			if (serverBook.finishedAt != null && local.finishedAt == null) {
				await queries.updateBook(
					serverBook.bookId,
					{ finishedAt: serverBook.finishedAt },
					Date.now(),
					{ isDeviceLocal: true },
				);
				changed = true;
			}

			// The origin key is the server's to assign and carries no revision: any
			// difference (first pull after the column landed, a rotated secret) is
			// adopted as is.
			if (serverBook.originKey && serverBook.originKey !== local.originKey) {
				await queries.updateBook(
					serverBook.bookId,
					{ originKey: serverBook.originKey },
					Date.now(),
					{ isDeviceLocal: true },
				);
				changed = true;
			}

			// Position and reader-editable metadata move as one revision of the row.
			const update = buildBookMergeUpdate(local, serverBook);
			if (update) {
				// Stamped with the server's timestamp, not now: this replays a change
				// made on another device, and a finish that happened in March must
				// not be recorded as happening today.
				await queries.updateBook(serverBook.bookId, update, serverBook.updatedAt);
				changed = true;
			}
		}

		// Flush buffered chapter rows as chunked bulk inserts. insertChapters uses
		// onConflictDoNothing so this is safe even if rows arrive from the server twice.
		// Only update localBookMap after the flush succeeds. The highlights merge below
		// uses localBookMap.has() to guard against orphans, so rows that fail to commit
		// must not appear there.
		if (newChapterRows.length > 0) {
			log("sync", `pull: batch-inserting ${newChapterRows.length} new chapter rows`);
			await queries.insertChapters(newChapterRows);
			for (const row of newChapterRows) localBookMap.set(row.id, row);
		}

		// --- Merge settings ---
		const localSettings = await queries.getSettings();
		if (data.settings) {
			if (data.settings.updatedAt > localSettings.updatedAt) {
				await queries.saveSettings(pick(data.settings, SYNCED_SETTING_KEYS));
				changed = true;
			}
		}

		// --- Merge highlights ---
		if (localSettings.syncHighlights) {
			const localHighlights = await queries.getAllHighlights();
			const localHighlightMap = new Map(localHighlights.map((h) => [h.id, h]));

			for (const serverHL of data.highlights) {
				if (serverHL.deleted) {
					// Server says deleted - remove locally if exists
					if (localHighlightMap.has(serverHL.highlightId)) {
						await queries.deleteHighlight(serverHL.highlightId);
						changed = true;
					}
					continue;
				}

				// Skip highlights for books not in local DB (avoids orphans)
				if (!localBookMap.has(serverHL.bookId)) continue;

				const local = localHighlightMap.get(serverHL.highlightId);
				if (!local) {
					// New highlight from server - add locally. Pull canonical
					// word anchors when present (ADR-0002 mirrored upload).
					await queries.addHighlight({
						id: serverHL.highlightId,
						bookId: serverHL.bookId,
						startWord: wordPos(serverHL.startWord),
						startCharInWord: serverHL.startCharInWord,
						endWord: wordPos(serverHL.endWord),
						endCharInWord: serverHL.endCharInWord,
						color: serverHL.color,
						note: serverHL.note,
						text: serverHL.text ?? null,
						createdAt: serverHL.createdAt,
						updatedAt: serverHL.updatedAt,
					});
					changed = true;
				} else if (serverHL.updatedAt > local.updatedAt) {
					// Server is newer - update locally
					await queries.updateHighlight(serverHL.highlightId, {
						color: serverHL.color,
						note: serverHL.note,
						updatedAt: serverHL.updatedAt,
					});
					changed = true;
				}
			}
		}

		// --- Merge glossary entries ---
		if (localSettings.syncGlossary) {
			const localEntries = await queries.getAllEntries();
			const localEntryMap = new Map(localEntries.map((e) => [e.id, e]));

			for (const serverEntry of data.glossaryEntries ?? []) {
				if (serverEntry.deleted) {
					if (localEntryMap.has(serverEntry.entryId)) {
						await queries.deleteEntry(serverEntry.entryId);
						changed = true;
					}
					continue;
				}

				// Book-scoped entries for unknown books are skipped (orphan guard);
				// global entries (bookId === null) always merge.
				if (serverEntry.bookId !== null && !localBookMap.has(serverEntry.bookId)) continue;

				const local = localEntryMap.get(serverEntry.entryId);
				if (!local) {
					await queries.addEntry({
						id: serverEntry.entryId,
						bookId: serverEntry.bookId,
						label: serverEntry.label,
						notes: serverEntry.notes,
						color: serverEntry.color,
						hideMarker: serverEntry.hideMarker,
						createdAt: serverEntry.createdAt,
						updatedAt: serverEntry.updatedAt,
					});
					changed = true;
				} else if (serverEntry.updatedAt > local.updatedAt) {
					await queries.updateEntry(serverEntry.entryId, {
						label: serverEntry.label,
						notes: serverEntry.notes,
						color: serverEntry.color,
						bookId: serverEntry.bookId,
						hideMarker: serverEntry.hideMarker,
						updatedAt: serverEntry.updatedAt,
					});
					changed = true;
				}
			}
		}

		// --- Merge reading sessions ---
		// Append-only: no `deleted` branch, no orphan guard. Sessions intentionally
		// outlive their book row for all-time totals. LWW on updatedAt.
		if (localSettings.syncStats) {
			const incoming: ReadingSession[] = [];
			let rejected = 0;
			for (const serverSession of data.readingSessions ?? []) {
				const parsed = SyncReadingSessionSchema.safeParse(serverSession);
				if (!parsed.success) {
					rejected++;
					continue;
				}
				const row = parsed.data;
				incoming.push({
					id: row.sessionId,
					bookId: row.bookId,
					mode: row.mode,
					startedAt: row.startedAt,
					endedAt: row.endedAt,
					durationMs: row.durationMs,
					wordsRead: row.wordsRead,
					startWord: wordPos(row.startWord),
					endWord: wordPos(row.endWord),
					wpmAvg: row.wpmAvg,
					updatedAt: row.updatedAt,
				});
			}
			if (rejected > 0) log("sync", `pull: skipped ${rejected} malformed session(s)`);
			if (incoming.length > 0) {
				await queries.upsertReadingSessions(incoming);
				changed = true;
			}
		}

		if (authoritativeContentIds) {
			for (const id of authoritativeContentIds) serverHasContent.add(id);
		}
		// Persist so a debounced push that runs before the next pull still knows what
		// the server holds. Without this every push re-uploads the whole library.
		await setServerContentIds(serverHasContent);

		// Invalidate React Query cache so UI reflects pulled changes
		if (changed) {
			queryClient.invalidateQueries({ queryKey: bookKeys.all });
			queryClient.invalidateQueries({ queryKey: settingsKeys.all });
			queryClient.invalidateQueries({ queryKey: glossaryKeys.all });
			queryClient.invalidateQueries({ queryKey: serialKeys.all });
			queryClient.invalidateQueries({ queryKey: readingSessionKeys.all });
			queryClient.invalidateQueries({ queryKey: statsKeys.all });
		}

		log("sync", "pull complete");
	});

	return serverHasContent;
}

// ---------------------------------------------------------------------------
// Push (POST /api/sync with full snapshot)
// ---------------------------------------------------------------------------

/**
 * Pristine pending chapter rows carry zero user data (position=0, lastRead=null,
 * chapterStatus="pending"). They are pure TOC placeholders re-derivable from the
 * upstream provider via useChapterListSync, so there is nothing to sync.
 * commitChapter() always sets lastRead=now on any status transition, making this
 * a precise "never touched by the user" gate. Tombstones always pass through.
 */
export function shouldPushBook(b: Book): boolean {
	if (!b.seriesId || b.deleted) return true;
	return b.chapterStatus !== "pending" || b.wordPosition > 0 || b.lastRead !== null;
}

/**
 * Book ids whose body content still has to be uploaded. Tombstones and chapter
 * rows never carry content (see bookToSync), and anything the server already
 * stores is skipped. The server keeps its stored value when the field is absent.
 */
export function booksNeedingContent(books: Book[], serverContentIds: Set<string>): Set<string> {
	const ids = new Set<string>();
	for (const book of books) {
		if (book.deleted || book.seriesId || serverContentIds.has(book.id)) continue;
		ids.add(book.id);
	}
	return ids;
}

/** Schema cap on `readingSessions` in a single payload. */
const SESSIONS_CAP = 50_000;

/**
 * Reading sessions are NOT filtered by pushedBookIds. Rows must outlive the book
 * for all-time totals.
 *
 * Over the cap, take the OLDEST rows by `updatedAt`, the same field the watermark
 * advances on. Clipping by `startedAt` instead would drop rows sitting below the
 * batch maximum, and the watermark would then move past them so they could never
 * be selected again. Taking the oldest keeps the watermark monotone and leaves the
 * remainder above it for the next push.
 */
export function clipSessionsForPush<T extends { updatedAt: number }>(
	rows: T[],
	cap: number = SESSIONS_CAP,
): T[] {
	if (rows.length <= cap) return rows;
	return [...rows].sort((a, b) => a.updatedAt - b.updatedAt).slice(0, cap);
}

/**
 * Split rows the server will accept from rows it would reject.
 *
 * The server `safeParse`s the whole payload and 400s it, so a single malformed row
 * would otherwise fail every other row in the push, forever: the watermark only
 * advances on acceptance, so the same row is reselected and rejected on every retry.
 *
 * This closes that door for sessions only. The other payload arrays are neither
 * screened nor clipped client-side, so an over-cap highlight set or an over-long
 * book title still fails the whole batch the same way.
 */
export function partitionPushableSessions(rows: SyncReadingSession[]): {
	pushable: SyncReadingSession[];
	rejected: SyncReadingSession[];
} {
	const pushable: SyncReadingSession[] = [];
	const rejected: SyncReadingSession[] = [];
	for (const row of rows) {
		if (SyncReadingSessionSchema.safeParse(row).success) pushable.push(row);
		else rejected.push(row);
	}
	return { pushable, rejected };
}

/**
 * Highest `updatedAt` among the pushed rows, never moving backwards and never past
 * this device's clock.
 *
 * The clamp matters: sessions pulled from another device keep that device's
 * `updatedAt` (see the pull merge), so a peer running fast would otherwise push the
 * watermark into the future. Every session recorded here until real time caught up
 * would sort below it and never be uploaded at all.
 */
export function nextSessionWatermark(
	rows: { updatedAt: number }[],
	current: number,
	nowMs: number = Date.now(),
): number {
	let max = current;
	for (const row of rows) if (row.updatedAt > max) max = row.updatedAt;
	return Math.min(max, Math.max(current, nowMs));
}

/**
 * @param serverHasContent bookIds the server already has content for, whose content
 * is omitted. Defaults to the persisted cache rather than an empty set:
 * an empty set means "the server has nothing", which re-uploads the entire library.
 */
export async function pushSync(serverHasContent?: Set<string>): Promise<void> {
	if (!(await isSyncReady())) return;

	await withSyncLock(async () => {
		log("sync", "pushing...");

		// Read inside the lock: a queued push must see what the one ahead of it just
		// committed, or it re-uploads the same content and resends the same sessions.
		const knownContentIds = serverHasContent ?? (await getServerContentIds());
		const sessionWatermark = await getSessionPushWatermark();

		const [books, settings, highlights, glossaryEntries, seriesRows, readingSessionsRows] =
			await Promise.all([
				queries.getBooksForSync(),
				queries.getSettings(),
				queries.getAllHighlights(),
				queries.getAllEntries(),
				queries.getSeriesForSync(),
				queries.getReadingSessionsSince(sessionWatermark),
			]);

		// Pristine pending chapter rows carry zero user data and are excluded from the
		// push payload — they will be recreated on any device via useChapterListSync.
		const pushable = books.filter(shouldPushBook);
		// Oversized books are local-only: their content/wordIndex exceed the bridge +
		// server limits, so they never leave the importing device. Their highlights and
		// glossary entries drop out automatically below (filtered by pushedBookIds);
		// reading sessions intentionally outlive the book, as for deletions.
		const booksForPush = pushable.filter(isSyncEligible);
		const pushedBookIds = new Set(booksForPush.map((book) => book.id));
		const filteredOut = books.length - pushable.length;
		if (filteredOut > 0) log("sync", `push: excluded ${filteredOut} pristine pending chapter rows`);
		const localOnly = pushable.length - booksForPush.length;
		if (localOnly > 0)
			log("sync", `push: excluded ${localOnly} local-only books (too large to sync)`);

		// Reading content back out of SQLite costs a bridge round-trip per 512 KB
		// chunk, so only books the server is actually missing are touched.
		const needContent = booksNeedingContent(booksForPush, knownContentIds);
		// Ids whose content actually made it into the payload. A missing content row
		// yields no content, and recording it as uploaded would tell every later push
		// the server has a body it never received.
		const uploadedContentIds = new Set<string>();
		const booksWithContent = await Promise.all(
			booksForPush.map(async (book) => {
				if (!needContent.has(book.id)) return bookToSync(book);
				const contentData = await queries.getBookContent(book.id);
				if (contentData) uploadedContentIds.add(book.id);
				return bookToSync(book, contentData);
			}),
		);

		const clippedSessions = clipSessionsForPush(readingSessionsRows);
		const { pushable: sessionsForPush, rejected: rejectedSessions } = partitionPushableSessions(
			clippedSessions.map(sessionToSync),
		);
		if (rejectedSessions.length > 0) {
			// Ids, not just a count: a rejected row stays local, and this is the only
			// way to find out which one. `resetSessionPushWatermark` re-offers them
			// all if a schema change later makes them acceptable.
			log(
				"sync",
				`push: dropped ${rejectedSessions.length} malformed session(s), ids=[${rejectedSessions
					.map((row) => row.sessionId)
					.join(",")}]`,
			);
		}

		const payload: SyncPayload = {
			books: booksWithContent,
			settings: settingsToSync(settings),
			highlights: settings.syncHighlights
				? highlights.filter((highlight) => pushedBookIds.has(highlight.bookId)).map(highlightToSync)
				: [],
			glossaryEntries: settings.syncGlossary
				? glossaryEntries
						.filter((entry) => entry.bookId === null || pushedBookIds.has(entry.bookId))
						.map(entryToSync)
				: [],
			series: seriesRows.map(seriesToSync),
			readingSessions: settings.syncStats ? sessionsForPush : [],
		};

		// Diagnostics for the >5000 books cap — log composition so we can see what's
		// driving the count (chapter rows from large serials vs. standalone imports).
		// (TASK-102)
		const chapterRowCount = booksWithContent.filter((b) => b.seriesId).length;
		const standaloneCount = booksWithContent.length - chapterRowCount;
		const chaptersPerSeries = new Map<string, number>();
		for (const b of booksWithContent) {
			if (b.seriesId)
				chaptersPerSeries.set(b.seriesId, (chaptersPerSeries.get(b.seriesId) ?? 0) + 1);
		}
		const topSeries = [...chaptersPerSeries.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, 5)
			.map(([id, n]) => `${id}:${n}`);
		const body = JSON.stringify(payload);
		log(
			"sync",
			`push payload books=${booksWithContent.length} standalone=${standaloneCount} chapterRows=${chapterRowCount} contentUploads=${uploadedContentIds.size} highlights=${payload.highlights.length} glossaryEntries=${payload.glossaryEntries.length} series=${payload.series?.length ?? 0} readingSessions=${payload.readingSessions?.length ?? 0} bodyBytes=${body.length} topSeries=[${topSeries.join(",")}]`,
		);

		await syncFetch("/api/sync", {
			method: "POST",
			body,
		});

		// Only after the server has accepted them: a failed push must not convince the
		// next one that content is already stored, or that sessions were delivered.
		if (uploadedContentIds.size > 0) await addServerContentIds(uploadedContentIds);
		if (settings.syncStats && clippedSessions.length > 0) {
			await Preferences.set({
				key: SESSIONS_PUSHED_KEY,
				value: String(nextSessionWatermark(clippedSessions, sessionWatermark)),
			});
		}

		await Preferences.set({
			key: LAST_SYNCED_KEY,
			value: String(Date.now()),
		});

		log("sync", "push complete");
	});
}

// ---------------------------------------------------------------------------
// Full sync (pull then push)
// ---------------------------------------------------------------------------

export async function fullSync(): Promise<void> {
	const serverHasContent = await pullSync();
	await pushSync(serverHasContent);
}

// ---------------------------------------------------------------------------
// Debounced push - callable from mutation hooks
// ---------------------------------------------------------------------------

let _pushTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleSyncPush(delayMs = 2000): void {
	if (!SYNC_ENABLED) return;

	if (_pushTimer) clearTimeout(_pushTimer);
	_pushTimer = setTimeout(() => {
		_pushTimer = null;
		pushSync().catch((err) => log.error("sync", "debounced push failed:", err));
	}, delayMs);
}
