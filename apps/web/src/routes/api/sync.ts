import {
	type BookStatus,
	pick,
	SYNCED_SETTING_KEYS,
	type SyncBook,
	type SyncGlossaryEntry,
	type SyncHighlight,
	type SyncPayload,
	SyncPayloadSchema,
	type SyncReadingSession,
	type SyncResponse,
	type SyncSeries,
	type SyncSettings,
} from "@lesefluss/core";
import { createFileRoute } from "@tanstack/react-router";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { type DbExecutor, db } from "~/db";
import {
	syncBookCopy,
	syncBooks,
	syncGlossaryEntries,
	syncHighlights,
	syncReadingSessions,
	syncSeries,
	syncSettings,
} from "~/db/schema";
import {
	contentQuotaBytes,
	contentQuotaExceededResponse,
	contentUsage,
	fitPushToContentQuota,
	lockContentQuota,
} from "~/lib/content-quota";
import { cors } from "~/lib/cors-middleware";
import { takenDownBookIds } from "~/lib/moderation/takedown";
import { type BookOrigin, originKey } from "~/lib/origin";
import { checkLimit } from "~/lib/rate-limit";
import { requireAuth } from "~/lib/session-middleware";
import { settleBuddyReads } from "~/lib/social/buddy-reads";
import { upsertSyncBooks } from "~/lib/sync-book-upsert";

// Body size limits are enforced at the reverse proxy (Coolify/Traefik). The
// Content-Length header is client-controlled, so enforcing it in Node here
// would be defense theatre - see deployment docs for the proxy-level cap.
function enforceRateLimit(userId: string): Response | null {
	const { ok, retryAfter } = checkLimit(`sync:${userId}`, { max: 30, windowMs: 60_000 });
	if (ok) return null;
	return Response.json(
		{ error: "Too many requests" },
		{ status: 429, headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined },
	);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function copyOriginsFor(
	exec: DbExecutor,
	userId: string,
	bookIds: string[],
): Promise<Map<string, BookOrigin>> {
	if (bookIds.length === 0) return new Map();
	const rows = await exec
		.select({
			bookId: syncBookCopy.bookId,
			originUserId: syncBookCopy.originUserId,
			originBookId: syncBookCopy.originBookId,
		})
		.from(syncBookCopy)
		.where(and(eq(syncBookCopy.userId, userId), inArray(syncBookCopy.bookId, bookIds)));
	return new Map(rows.map((r) => [r.bookId, r]));
}

/**
 * Drops pushed copies whose recorded origin already has a live row in the
 * account under another book id; storing them would break the one-live-copy-
 * per-origin rule and abort the whole push.
 */
async function withoutDuplicateOrigins(
	exec: DbExecutor,
	userId: string,
	books: SyncBook[],
	origins: Map<string, BookOrigin>,
): Promise<SyncBook[]> {
	if (origins.size === 0) return books;
	const live = await exec
		.select({
			bookId: syncBooks.bookId,
			originUserId: syncBooks.originUserId,
			originBookId: syncBooks.originBookId,
		})
		.from(syncBooks)
		.where(and(eq(syncBooks.userId, userId), eq(syncBooks.deleted, false)));
	const key = (o: BookOrigin) => `${o.originUserId}:${o.originBookId}`;
	const liveByOrigin = new Map(live.map((r) => [key(r), r.bookId]));
	const seen = new Set<string>();
	return books.filter((book) => {
		const origin = origins.get(book.bookId);
		if (!origin || book.deleted) return true;
		const k = key(origin);
		const holder = liveByOrigin.get(k);
		if (holder && holder !== book.bookId) return false;
		if (!holder && seen.has(k)) return false;
		seen.add(k);
		return true;
	});
}

/** Convert a Postgres Date to Unix ms */
function toMs(d: Date): number {
	return d.getTime();
}

/** Convert Unix ms to a Postgres Date */
function toDate(ms: number): Date {
	return new Date(ms);
}

/** Query all sync data for a user and return as SyncResponse (Unix ms timestamps).
 *  Books in `excludeContentFor` will have content/coverImage/chapters omitted. */
async function getUserSyncData(
	userId: string,
	excludeContentFor: Set<string> = new Set(),
): Promise<SyncResponse> {
	// Fetch metadata for all books (lightweight - no content columns)
	const metadataCols = {
		bookId: syncBooks.bookId,
		title: syncBooks.title,
		author: syncBooks.author,
		fileSize: syncBooks.fileSize,
		wordCount: syncBooks.wordCount,
		wordPosition: syncBooks.wordPosition,
		source: syncBooks.source,
		catalogId: syncBooks.catalogId,
		sourceUrl: syncBooks.sourceUrl,
		finishedAt: syncBooks.finishedAt,
		addedAt: syncBooks.addedAt,
		seriesId: syncBooks.seriesId,
		chapterIndex: syncBooks.chapterIndex,
		chapterSourceUrl: syncBooks.chapterSourceUrl,
		chapterStatus: syncBooks.chapterStatus,
		description: syncBooks.description,
		language: syncBooks.language,
		status: syncBooks.status,
		rating: syncBooks.rating,
		review: syncBooks.review,
		tags: syncBooks.tags,
		hideFromProfile: syncBooks.hideFromProfile,
		originUserId: syncBooks.originUserId,
		originBookId: syncBooks.originBookId,
		deleted: syncBooks.deleted,
		updatedAt: syncBooks.updatedAt,
		metadataUpdatedAt: syncBooks.metadataUpdatedAt,
		// Presence flag only. The content itself is fetched separately below, and
		// only for books the client says it doesn't have.
		hasContent: sql<boolean>`${syncBooks.content} IS NOT NULL`,
	};
	const [books, settingsRows, highlights, glossaryRows, seriesRows, readingSessionRows, usedBytes] =
		await Promise.all([
			db.select(metadataCols).from(syncBooks).where(eq(syncBooks.userId, userId)),
			db.select().from(syncSettings).where(eq(syncSettings.userId, userId)),
			db.select().from(syncHighlights).where(eq(syncHighlights.userId, userId)),
			db.select().from(syncGlossaryEntries).where(eq(syncGlossaryEntries.userId, userId)),
			db.select().from(syncSeries).where(eq(syncSeries.userId, userId)),
			db.select().from(syncReadingSessions).where(eq(syncReadingSessions.userId, userId)),
			contentUsage(db, userId),
		]);

	// Fetch content only for books the client doesn't have locally and which aren't tombstoned
	const needContentIds = books
		.filter((b) => !b.deleted && !excludeContentFor.has(b.bookId))
		.map((b) => b.bookId);

	const contentMap = new Map<
		string,
		{
			content: string | null;
			coverImage: string | null;
			chapters: string | null;
			linkRanges: string | null;
		}
	>();
	if (needContentIds.length > 0) {
		const contentRows = await db
			.select({
				bookId: syncBooks.bookId,
				content: syncBooks.content,
				coverImage: syncBooks.coverImage,
				chapters: syncBooks.chapters,
				linkRanges: syncBooks.linkRanges,
			})
			.from(syncBooks)
			.where(and(eq(syncBooks.userId, userId), inArray(syncBooks.bookId, needContentIds)));
		for (const row of contentRows) {
			contentMap.set(row.bookId, row);
		}
	}

	return {
		contentBookIds: books.filter((b) => !b.deleted && b.hasContent).map((b) => b.bookId),
		contentQuota: { usedBytes, quotaBytes: contentQuotaBytes() },
		books: books.map((b) => {
			const content = contentMap.get(b.bookId);
			return {
				bookId: b.bookId,
				title: b.title,
				author: b.author,
				fileSize: b.fileSize,
				wordCount: b.wordCount,
				wordPosition: b.wordPosition,
				source: b.source,
				catalogId: b.catalogId,
				sourceUrl: b.sourceUrl,
				finishedAt: b.finishedAt ? toMs(b.finishedAt) : null,
				addedAt: b.addedAt ? toMs(b.addedAt) : null,
				seriesId: b.seriesId,
				chapterIndex: b.chapterIndex,
				chapterSourceUrl: b.chapterSourceUrl,
				chapterStatus: b.chapterStatus as "pending" | "fetched" | "locked" | "error",
				description: b.description,
				language: b.language,
				// Cast: PG `text` widens the column; the union is enforced by the Zod
				// enum on push and a CHECK constraint on the table.
				status: b.status as BookStatus | null,
				rating: b.rating,
				review: b.review,
				tags: b.tags,
				hideFromProfile: b.hideFromProfile,
				originKey: originKey(b),
				deleted: b.deleted,
				...(content
					? {
							content: content.content,
							coverImage: content.coverImage,
							chapters: content.chapters,
							linkRanges: content.linkRanges,
						}
					: {}),
				updatedAt: toMs(b.updatedAt),
				metadataUpdatedAt: b.metadataUpdatedAt ? toMs(b.metadataUpdatedAt) : null,
			};
		}),
		// Cast: PG `text` columns widen enum fields to `string`; SyncSettings narrows
		// them to literal unions. Values originate from Zod-validated input on POST.
		settings: settingsRows[0]
			? ({
					...pick(settingsRows[0], SYNCED_SETTING_KEYS),
					updatedAt: toMs(settingsRows[0].updatedAt),
				} as SyncSettings)
			: null,
		highlights: highlights.map(
			(h) =>
				({
					highlightId: h.highlightId,
					bookId: h.bookId,
					startWord: h.startWord,
					startCharInWord: h.startCharInWord,
					endWord: h.endWord,
					endCharInWord: h.endCharInWord,
					color: h.color,
					note: h.note,
					text: h.text,
					deleted: h.deleted,
					createdAt: toMs(h.createdAt),
					updatedAt: toMs(h.updatedAt),
				}) as SyncHighlight,
		),
		glossaryEntries: glossaryRows.map(
			(e) =>
				({
					entryId: e.entryId,
					bookId: e.bookId,
					label: e.label,
					notes: e.notes,
					color: e.color,
					hideMarker: e.hideMarker,
					deleted: e.deleted,
					createdAt: toMs(e.createdAt),
					updatedAt: toMs(e.updatedAt),
				}) as SyncGlossaryEntry,
		),
		series: seriesRows.map(
			(s) =>
				({
					seriesId: s.seriesId,
					title: s.title,
					author: s.author,
					coverImage: s.coverImage,
					description: s.description,
					sourceUrl: s.sourceUrl,
					tocUrl: s.tocUrl,
					provider: s.provider,
					lastCheckedAt: s.lastCheckedAt ? toMs(s.lastCheckedAt) : null,
					createdAt: toMs(s.createdAt),
					deleted: s.deleted,
					updatedAt: toMs(s.updatedAt),
				}) as SyncSeries,
		),
		readingSessions: readingSessionRows.map(
			(r) =>
				({
					sessionId: r.sessionId,
					bookId: r.bookId,
					mode: r.mode,
					startedAt: toMs(r.startedAt),
					endedAt: toMs(r.endedAt),
					durationMs: r.durationMs,
					wordsRead: r.wordsRead,
					startWord: r.startWord,
					endWord: r.endWord,
					wpmAvg: r.wpmAvg,
					updatedAt: toMs(r.updatedAt),
				}) as SyncReadingSession,
		),
	};
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/api/sync")({
	server: {
		middleware: [cors, requireAuth],
		handlers: {
			// -----------------------------------------------------------------
			// GET /api/sync - pull all user data
			// -----------------------------------------------------------------
			GET: async ({ request, context }) => {
				const userId = context.user.id;
				const limited = enforceRateLimit(userId);
				if (limited) return limited;
				// Client sends bookIds it already has via header (avoids URL length limits with many books)
				const haveHeader = request.headers.get("x-sync-have") ?? "";
				const haveIds = new Set(haveHeader.split(",").filter(Boolean));
				const data = await getUserSyncData(userId, haveIds);
				return Response.json(data);
			},

			// -----------------------------------------------------------------
			// POST /api/sync - push full snapshot, return merged state
			// -----------------------------------------------------------------
			POST: async ({ request, context }) => {
				const userId = context.user.id;
				const limited = enforceRateLimit(userId);
				if (limited) return limited;

				const body = await request.json();

				// Validate input
				const parsed = SyncPayloadSchema.safeParse(body);
				if (!parsed.success) {
					return Response.json(
						{ error: "Invalid payload", issues: parsed.error.issues },
						{ status: 400 },
					);
				}

				const payload: SyncPayload = parsed.data;

				const quotaFit = await db.transaction(async (tx) => {
					// First, so a share accepted meanwhile cannot land a live copy of an
					// origin between the duplicate check below and the upsert.
					await lockContentQuota(tx, userId);
					// A book removed by a takedown never comes back, not even from a
					// device that was offline when it happened and still holds a copy.
					const takenDown = await takenDownBookIds(
						tx,
						userId,
						payload.books.map((b) => b.bookId),
					);
					const pushedBooks = payload.books.filter((b) => !takenDown.has(b.bookId));
					// A copy pushed back after Clear cloud data keeps its recorded origin,
					// unless the account meanwhile holds another live copy of that origin:
					// then the stale row stays on the device and is not stored again.
					const origins = await copyOriginsFor(
						tx,
						userId,
						pushedBooks.map((b) => b.bookId),
					);
					const fitted = await fitPushToContentQuota(
						tx,
						userId,
						await withoutDuplicateOrigins(tx, userId, pushedBooks, origins),
					);
					const books = fitted.books;
					const highlights = payload.highlights.filter((h) => !takenDown.has(h.bookId));
					const glossaryEntries = payload.glossaryEntries.filter(
						(e) => e.bookId === null || e.bookId === undefined || !takenDown.has(e.bookId),
					);

					// --- Books: batched upsert ---
					// Grouped by what the payload claims (reader-editable columns, the
					// hide-from-profile flag). A client build that pre-dates a column omits
					// it entirely, and `bookInsertValues` has to turn that into a default to
					// build a row; merging those defaults would erase what an up-to-date
					// device wrote the first time an older one pushed a newer position.
					await upsertSyncBooks(tx, userId, books, origins);

					// --- Series: batched upsert ---
					if (payload.series && payload.series.length > 0) {
						await tx
							.insert(syncSeries)
							.values(
								payload.series.map((s) => ({
									userId,
									seriesId: s.seriesId,
									title: s.title,
									author: s.author,
									coverImage: s.coverImage ?? null,
									description: s.description,
									sourceUrl: s.sourceUrl,
									tocUrl: s.tocUrl,
									provider: s.provider,
									lastCheckedAt: s.lastCheckedAt ? toDate(s.lastCheckedAt) : null,
									createdAt: toDate(s.createdAt),
									deleted: s.deleted,
									updatedAt: toDate(s.updatedAt),
								})),
							)
							.onConflictDoUpdate({
								target: [syncSeries.userId, syncSeries.seriesId],
								set: {
									title: sql`CASE WHEN excluded.updated_at >= sync_series.updated_at THEN excluded.title ELSE sync_series.title END`,
									author: sql`CASE WHEN excluded.updated_at >= sync_series.updated_at THEN excluded.author ELSE sync_series.author END`,
									coverImage: sql`CASE WHEN excluded.updated_at >= sync_series.updated_at THEN excluded.cover_image ELSE sync_series.cover_image END`,
									description: sql`CASE WHEN excluded.updated_at >= sync_series.updated_at THEN excluded.description ELSE sync_series.description END`,
									tocUrl: sql`CASE WHEN excluded.updated_at >= sync_series.updated_at THEN excluded.toc_url ELSE sync_series.toc_url END`,
									lastCheckedAt: sql`CASE WHEN excluded.updated_at >= sync_series.updated_at THEN excluded.last_checked_at ELSE sync_series.last_checked_at END`,
									// Sticky tombstone parallel to sync_books.
									deleted: sql`sync_series.deleted OR excluded.deleted`,
									updatedAt: sql`GREATEST(excluded.updated_at, sync_series.updated_at)`,
								},
							});

						// Cascade: tombstone every chapter row for an incoming deleted
						// series. The client now hard-deletes chapter rows on series-delete
						// and never pushes them, so without this the server would still
						// hand them to other devices on pull. Sticky tombstone semantics on
						// sync_books.deleted prevent later resurrection. (TASK-102)
						const deletedSeriesIds = payload.series.filter((s) => s.deleted).map((s) => s.seriesId);
						if (deletedSeriesIds.length > 0) {
							await tx
								.update(syncBooks)
								.set({ deleted: true, updatedAt: new Date() })
								.where(
									and(
										eq(syncBooks.userId, userId),
										inArray(syncBooks.seriesId, deletedSeriesIds),
										eq(syncBooks.deleted, false),
									),
								);
						}
					}

					// --- Settings: upsert ---
					if (payload.settings) {
						const settingsFields = {
							...pick(payload.settings, SYNCED_SETTING_KEYS),
							updatedAt: toDate(payload.settings.updatedAt),
						};
						await tx
							.insert(syncSettings)
							.values({ userId, ...settingsFields })
							.onConflictDoUpdate({
								target: [syncSettings.userId],
								set: settingsFields,
							});
					}

					// --- Highlights: batched upsert + tombstone missing ---
					if (highlights.length > 0) {
						await tx
							.insert(syncHighlights)
							.values(
								highlights.map((h) => ({
									userId,
									highlightId: h.highlightId,
									bookId: h.bookId,
									startWord: h.startWord,
									startCharInWord: h.startCharInWord,
									endWord: h.endWord,
									endCharInWord: h.endCharInWord,
									color: h.color,
									note: h.note,
									text: h.text ?? null,
									deleted: h.deleted,
									createdAt: toDate(h.createdAt),
									updatedAt: toDate(h.updatedAt),
								})),
							)
							.onConflictDoUpdate({
								target: [syncHighlights.userId, syncHighlights.highlightId],
								set: {
									bookId: sql`excluded.book_id`,
									startWord: sql`excluded.start_word`,
									startCharInWord: sql`excluded.start_char_in_word`,
									endWord: sql`excluded.end_word`,
									endCharInWord: sql`excluded.end_char_in_word`,
									color: sql`excluded.color`,
									note: sql`excluded.note`,
									text: sql`COALESCE(excluded.text, sync_highlights.text)`,
									deleted: sql`excluded.deleted`,
									updatedAt: sql`excluded.updated_at`,
								},
							});

						// Mark server-only highlights as deleted
						const pushIds = highlights.map((h) => h.highlightId);
						await tx
							.update(syncHighlights)
							.set({ deleted: true, updatedAt: new Date() })
							.where(
								and(
									eq(syncHighlights.userId, userId),
									eq(syncHighlights.deleted, false),
									notInArray(syncHighlights.highlightId, pushIds),
								),
							);
					} else {
						// Client sent no highlights - mark all as deleted
						await tx
							.update(syncHighlights)
							.set({ deleted: true, updatedAt: new Date() })
							.where(and(eq(syncHighlights.userId, userId), eq(syncHighlights.deleted, false)));
					}

					// --- Glossary entries: batched upsert + tombstone missing ---
					if (glossaryEntries.length > 0) {
						await tx
							.insert(syncGlossaryEntries)
							.values(
								glossaryEntries.map((e) => ({
									userId,
									entryId: e.entryId,
									bookId: e.bookId,
									label: e.label,
									notes: e.notes,
									color: e.color,
									hideMarker: e.hideMarker,
									deleted: e.deleted,
									createdAt: toDate(e.createdAt),
									updatedAt: toDate(e.updatedAt),
								})),
							)
							.onConflictDoUpdate({
								target: [syncGlossaryEntries.userId, syncGlossaryEntries.entryId],
								set: {
									bookId: sql`excluded.book_id`,
									label: sql`excluded.label`,
									notes: sql`excluded.notes`,
									color: sql`excluded.color`,
									hideMarker: sql`excluded.hide_marker`,
									deleted: sql`excluded.deleted`,
									updatedAt: sql`excluded.updated_at`,
								},
							});

						const pushIds = glossaryEntries.map((e) => e.entryId);
						await tx
							.update(syncGlossaryEntries)
							.set({ deleted: true, updatedAt: new Date() })
							.where(
								and(
									eq(syncGlossaryEntries.userId, userId),
									eq(syncGlossaryEntries.deleted, false),
									notInArray(syncGlossaryEntries.entryId, pushIds),
								),
							);
					} else {
						await tx
							.update(syncGlossaryEntries)
							.set({ deleted: true, updatedAt: new Date() })
							.where(
								and(eq(syncGlossaryEntries.userId, userId), eq(syncGlossaryEntries.deleted, false)),
							);
					}

					// --- Reading sessions: append-only upsert (no tombstone-on-omission) ---
					// Sessions are never edited or deleted from the client; the row with the
					// higher updatedAt wins. We do NOT mark missing rows as deleted: clients
					// with >50k local sessions clip newest-first when pushing, and we would
					// lose older rows that other devices have not seen yet.
					if (payload.readingSessions.length > 0) {
						await tx
							.insert(syncReadingSessions)
							.values(
								payload.readingSessions.map((r) => ({
									userId,
									sessionId: r.sessionId,
									bookId: r.bookId,
									mode: r.mode,
									startedAt: toDate(r.startedAt),
									endedAt: toDate(r.endedAt),
									durationMs: r.durationMs,
									wordsRead: r.wordsRead,
									startWord: r.startWord,
									endWord: r.endWord,
									wpmAvg: r.wpmAvg,
									updatedAt: toDate(r.updatedAt),
								})),
							)
							.onConflictDoUpdate({
								target: [syncReadingSessions.userId, syncReadingSessions.sessionId],
								set: {
									bookId: sql`CASE WHEN excluded.updated_at >= sync_reading_sessions.updated_at THEN excluded.book_id ELSE sync_reading_sessions.book_id END`,
									mode: sql`CASE WHEN excluded.updated_at >= sync_reading_sessions.updated_at THEN excluded.mode ELSE sync_reading_sessions.mode END`,
									startedAt: sql`CASE WHEN excluded.updated_at >= sync_reading_sessions.updated_at THEN excluded.started_at ELSE sync_reading_sessions.started_at END`,
									endedAt: sql`CASE WHEN excluded.updated_at >= sync_reading_sessions.updated_at THEN excluded.ended_at ELSE sync_reading_sessions.ended_at END`,
									durationMs: sql`CASE WHEN excluded.updated_at >= sync_reading_sessions.updated_at THEN excluded.duration_ms ELSE sync_reading_sessions.duration_ms END`,
									wordsRead: sql`CASE WHEN excluded.updated_at >= sync_reading_sessions.updated_at THEN excluded.words_read ELSE sync_reading_sessions.words_read END`,
									startWord: sql`CASE WHEN excluded.updated_at >= sync_reading_sessions.updated_at THEN excluded.start_word ELSE sync_reading_sessions.start_word END`,
									endWord: sql`CASE WHEN excluded.updated_at >= sync_reading_sessions.updated_at THEN excluded.end_word ELSE sync_reading_sessions.end_word END`,
									wpmAvg: sql`CASE WHEN excluded.updated_at >= sync_reading_sessions.updated_at THEN excluded.wpm_avg ELSE sync_reading_sessions.wpm_avg END`,
									updatedAt: sql`GREATEST(excluded.updated_at, sync_reading_sessions.updated_at)`,
								},
							});
					}
					return fitted;
				});

				try {
					await settleBuddyReads(
						userId,
						payload.books.map((b) => b.bookId),
					);
				} catch (err) {
					console.error("sync: buddy-read settle failed", err);
				}

				// Everything else in the push is committed; the 413 only reports the
				// content that did not fit, so the client stops re-uploading it.
				if (quotaFit.rejected.length > 0) {
					return contentQuotaExceededResponse(quotaFit.quota, quotaFit.rejected);
				}

				// No body: the client pulls with GET and discards whatever POST returns,
				// so building a full merged snapshot here is a wasted query and a wasted
				// download on every push.
				return new Response(null, { status: 204 });
			},
		},
	},
});
