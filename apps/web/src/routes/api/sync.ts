import {
	pick,
	SYNCED_SETTING_KEYS,
	type SyncGlossaryEntry,
	type SyncHighlight,
	type SyncPayload,
	SyncPayloadSchema,
	type SyncResponse,
	type SyncSettings,
} from "@lesefluss/rsvp-core";
import { createFileRoute } from "@tanstack/react-router";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "~/db";
import { syncBooks, syncGlossaryEntries, syncHighlights, syncSettings } from "~/db/schema";
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
		deleted: syncBooks.deleted,
		updatedAt: syncBooks.updatedAt,
	};
	const [books, settingsRows, highlights, glossaryRows] = await Promise.all([
		db.select(metadataCols).from(syncBooks).where(eq(syncBooks.userId, userId)),
		db.select().from(syncSettings).where(eq(syncSettings.userId, userId)),
		db.select().from(syncHighlights).where(eq(syncHighlights.userId, userId)),
		db.select().from(syncGlossaryEntries).where(eq(syncGlossaryEntries.userId, userId)),
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
					deleted: e.deleted,
					createdAt: toMs(e.createdAt),
					updatedAt: toMs(e.updatedAt),
				}) as SyncGlossaryEntry,
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
									// Tombstoned books shouldn't carry content; null defensively
									content: book.deleted ? null : (book.content ?? null),
									coverImage: book.deleted ? null : (book.coverImage ?? null),
									chapters: book.deleted ? null : (book.chapters ?? null),
									source: book.source ?? null,
									catalogId: book.catalogId ?? null,
									sourceUrl: book.sourceUrl ?? null,
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
									content: sql`CASE WHEN sync_books.deleted OR excluded.deleted THEN NULL ELSE COALESCE(excluded.content, sync_books.content) END`,
									coverImage: sql`CASE WHEN sync_books.deleted OR excluded.deleted THEN NULL ELSE COALESCE(excluded.cover_image, sync_books.cover_image) END`,
									chapters: sql`CASE WHEN sync_books.deleted OR excluded.deleted THEN NULL ELSE COALESCE(excluded.chapters, sync_books.chapters) END`,
									source: sql`COALESCE(excluded.source, sync_books.source)`,
									catalogId: sql`COALESCE(excluded.catalog_id, sync_books.catalog_id)`,
									sourceUrl: sql`COALESCE(excluded.source_url, sync_books.source_url)`,
									// Sticky tombstone: deleted=true cannot be flipped back by any client push.
									deleted: sql`sync_books.deleted OR excluded.deleted`,
									updatedAt: sql`GREATEST(excluded.updated_at, sync_books.updated_at)`,
								},
							});
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
				});

				// Return merged state - exclude content for books the client already has
				const clientBookIds = new Set(payload.books.map((b) => b.bookId));
				const data = await getUserSyncData(userId, clientBookIds);
				return Response.json(data);
			},
		},
	},
});
