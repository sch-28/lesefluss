import {
	pick,
	SYNCED_SETTING_KEYS,
	type SyncGlossaryEntry,
	type SyncHighlight,
	type SyncPayload,
	SyncPayloadSchema,
	type SyncReadingSession,
	type SyncResponse,
	type SyncSeries,
	type SyncSettings,
} from "@lesefluss/rsvp-core";
import { createFileRoute } from "@tanstack/react-router";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "~/db";
import {
	syncBooks,
	syncGlossaryEntries,
	syncHighlights,
	syncReadingSessions,
	syncSeries,
	syncSettings,
} from "~/db/schema";
import { cors } from "~/lib/cors-middleware";
import { checkLimit } from "~/lib/rate-limit";
import { requireAuth } from "~/lib/session-middleware";

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
		position: syncBooks.position,
		source: syncBooks.source,
		catalogId: syncBooks.catalogId,
		sourceUrl: syncBooks.sourceUrl,
		seriesId: syncBooks.seriesId,
		chapterIndex: syncBooks.chapterIndex,
		chapterSourceUrl: syncBooks.chapterSourceUrl,
		chapterStatus: syncBooks.chapterStatus,
		deleted: syncBooks.deleted,
		updatedAt: syncBooks.updatedAt,
	};
	const [books, settingsRows, highlights, glossaryRows, seriesRows, readingSessionRows] =
		await Promise.all([
			db.select(metadataCols).from(syncBooks).where(eq(syncBooks.userId, userId)),
			db.select().from(syncSettings).where(eq(syncSettings.userId, userId)),
			db.select().from(syncHighlights).where(eq(syncHighlights.userId, userId)),
			db.select().from(syncGlossaryEntries).where(eq(syncGlossaryEntries.userId, userId)),
			db.select().from(syncSeries).where(eq(syncSeries.userId, userId)),
			db.select().from(syncReadingSessions).where(eq(syncReadingSessions.userId, userId)),
		]);

	// Fetch content only for books the client doesn't have locally and which aren't tombstoned
	const needContentIds = books
		.filter((b) => !b.deleted && !excludeContentFor.has(b.bookId))
		.map((b) => b.bookId);

	const contentMap = new Map<
		string,
		{ content: string | null; coverImage: string | null; chapters: string | null }
	>();
	if (needContentIds.length > 0) {
		const contentRows = await db
			.select({
				bookId: syncBooks.bookId,
				content: syncBooks.content,
				coverImage: syncBooks.coverImage,
				chapters: syncBooks.chapters,
			})
			.from(syncBooks)
			.where(and(eq(syncBooks.userId, userId), inArray(syncBooks.bookId, needContentIds)));
		for (const row of contentRows) {
			contentMap.set(row.bookId, row);
		}
	}

	return {
		books: books.map((b) => {
			const content = contentMap.get(b.bookId);
			return {
				bookId: b.bookId,
				title: b.title,
				author: b.author,
				fileSize: b.fileSize,
				wordCount: b.wordCount,
				position: b.position,
				source: b.source,
				catalogId: b.catalogId,
				sourceUrl: b.sourceUrl,
				seriesId: b.seriesId,
				chapterIndex: b.chapterIndex,
				chapterSourceUrl: b.chapterSourceUrl,
				chapterStatus: b.chapterStatus as "pending" | "fetched" | "locked" | "error",
				deleted: b.deleted,
				...(content
					? {
							content: content.content,
							coverImage: content.coverImage,
							chapters: content.chapters,
						}
					: {}),
				updatedAt: toMs(b.updatedAt),
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
					startOffset: h.startOffset,
					endOffset: h.endOffset,
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
					startPos: r.startPos,
					endPos: r.endPos,
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

				await db.transaction(async (tx) => {
					// --- Books: batched upsert ---
					if (payload.books.length > 0) {
						await tx
							.insert(syncBooks)
							.values(
								payload.books.map((book) => ({
									userId,
									bookId: book.bookId,
									title: book.title,
									author: book.author,
									fileSize: book.fileSize,
									wordCount: book.wordCount,
									position: book.position,
									// Tombstoned books shouldn't carry content; null defensively.
									// Chapter rows (seriesId set) are re-derivable from upstream — never store body
									// content for them server-side, even if an old client still pushes it.
									content: book.deleted || book.seriesId ? null : (book.content ?? null),
									coverImage: book.deleted || book.seriesId ? null : (book.coverImage ?? null),
									chapters: book.deleted || book.seriesId ? null : (book.chapters ?? null),
									source: book.source ?? null,
									catalogId: book.catalogId ?? null,
									sourceUrl: book.sourceUrl ?? null,
									seriesId: book.seriesId ?? null,
									chapterIndex: book.chapterIndex ?? null,
									chapterSourceUrl: book.chapterSourceUrl ?? null,
									chapterStatus: book.chapterStatus ?? "fetched",
									deleted: book.deleted,
									updatedAt: toDate(book.updatedAt),
								})),
							)
							.onConflictDoUpdate({
								target: [syncBooks.userId, syncBooks.bookId],
								set: {
									title: sql`excluded.title`,
									author: sql`excluded.author`,
									fileSize: sql`excluded.file_size`,
									wordCount: sql`excluded.word_count`,
									position: sql`CASE WHEN excluded.updated_at >= sync_books.updated_at THEN excluded.position ELSE sync_books.position END`,
									// Once a row is deleted on the server, content stays null — no client push can refill it.
									// Chapter rows (series_id set) are re-derivable from upstream; never store body content
									// for them, regardless of what an old client pushes or what was there before.
									content: sql`CASE WHEN sync_books.deleted OR excluded.deleted OR excluded.series_id IS NOT NULL THEN NULL ELSE COALESCE(excluded.content, sync_books.content) END`,
									coverImage: sql`CASE WHEN sync_books.deleted OR excluded.deleted OR excluded.series_id IS NOT NULL THEN NULL ELSE COALESCE(excluded.cover_image, sync_books.cover_image) END`,
									chapters: sql`CASE WHEN sync_books.deleted OR excluded.deleted OR excluded.series_id IS NOT NULL THEN NULL ELSE COALESCE(excluded.chapters, sync_books.chapters) END`,
									source: sql`COALESCE(excluded.source, sync_books.source)`,
									catalogId: sql`COALESCE(excluded.catalog_id, sync_books.catalog_id)`,
									sourceUrl: sql`COALESCE(excluded.source_url, sync_books.source_url)`,
									seriesId: sql`COALESCE(excluded.series_id, sync_books.series_id)`,
									chapterIndex: sql`COALESCE(excluded.chapter_index, sync_books.chapter_index)`,
									chapterSourceUrl: sql`COALESCE(excluded.chapter_source_url, sync_books.chapter_source_url)`,
									// chapter_status overwrites freely — latest write wins, gated by updated_at.
									chapterStatus: sql`CASE WHEN excluded.updated_at >= sync_books.updated_at THEN excluded.chapter_status ELSE sync_books.chapter_status END`,
									// Sticky tombstone: deleted=true cannot be flipped back by any client push.
									deleted: sql`sync_books.deleted OR excluded.deleted`,
									updatedAt: sql`GREATEST(excluded.updated_at, sync_books.updated_at)`,
								},
							});
					}

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
					if (payload.highlights.length > 0) {
						await tx
							.insert(syncHighlights)
							.values(
								payload.highlights.map((h) => ({
									userId,
									highlightId: h.highlightId,
									bookId: h.bookId,
									startOffset: h.startOffset,
									endOffset: h.endOffset,
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
									startOffset: sql`excluded.start_offset`,
									endOffset: sql`excluded.end_offset`,
									color: sql`excluded.color`,
									note: sql`excluded.note`,
									text: sql`COALESCE(excluded.text, sync_highlights.text)`,
									deleted: sql`excluded.deleted`,
									updatedAt: sql`excluded.updated_at`,
								},
							});

						// Mark server-only highlights as deleted
						const pushIds = payload.highlights.map((h) => h.highlightId);
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
					if (payload.glossaryEntries.length > 0) {
						await tx
							.insert(syncGlossaryEntries)
							.values(
								payload.glossaryEntries.map((e) => ({
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

						const pushIds = payload.glossaryEntries.map((e) => e.entryId);
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
									startPos: r.startPos,
									endPos: r.endPos,
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
									startPos: sql`CASE WHEN excluded.updated_at >= sync_reading_sessions.updated_at THEN excluded.start_pos ELSE sync_reading_sessions.start_pos END`,
									endPos: sql`CASE WHEN excluded.updated_at >= sync_reading_sessions.updated_at THEN excluded.end_pos ELSE sync_reading_sessions.end_pos END`,
									wpmAvg: sql`CASE WHEN excluded.updated_at >= sync_reading_sessions.updated_at THEN excluded.wpm_avg ELSE sync_reading_sessions.wpm_avg END`,
									updatedAt: sql`GREATEST(excluded.updated_at, sync_reading_sessions.updated_at)`,
								},
							});
					}
				});

				// Return merged state - exclude content for books the client already has
				const clientBookIds = new Set(payload.books.map((b) => b.bookId));
				const data = await getUserSyncData(userId, clientBookIds);
				return Response.json(data);
			},
		},
	},
});
