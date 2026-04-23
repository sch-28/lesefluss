import type { SyncHighlight, SyncPayload, SyncResponse, SyncSettings } from "@lesefluss/rsvp-core";
import { SyncPayloadSchema } from "@lesefluss/rsvp-core";
import { createFileRoute } from "@tanstack/react-router";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "~/db";
import { syncBooks, syncHighlights, syncSettings } from "~/db/schema";
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
		updatedAt: syncBooks.updatedAt,
	};
	const [books, settingsRows, highlights] = await Promise.all([
		db.select(metadataCols).from(syncBooks).where(eq(syncBooks.userId, userId)),
		db.select().from(syncSettings).where(eq(syncSettings.userId, userId)),
		db.select().from(syncHighlights).where(eq(syncHighlights.userId, userId)),
	]);

	// Fetch content only for books the client doesn't have locally
	const needContentIds = books.map((b) => b.bookId).filter((id) => !excludeContentFor.has(id));

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
		settings: settingsRows[0]
			? ({
					wpm: settingsRows[0].wpm,
					delayComma: settingsRows[0].delayComma,
					delayPeriod: settingsRows[0].delayPeriod,
					accelStart: settingsRows[0].accelStart,
					accelRate: settingsRows[0].accelRate,
					xOffset: settingsRows[0].xOffset,
					wordOffset: settingsRows[0].wordOffset,
					readerTheme: settingsRows[0].readerTheme,
					readerFontSize: settingsRows[0].readerFontSize,
					readerFontFamily: settingsRows[0].readerFontFamily,
					readerLineSpacing: settingsRows[0].readerLineSpacing,
					readerMargin: settingsRows[0].readerMargin,
					showReadingTime: settingsRows[0].showReadingTime,
					readerActiveWordUnderline: settingsRows[0].readerActiveWordUnderline,
					defaultReaderMode: settingsRows[0].defaultReaderMode as SyncSettings["defaultReaderMode"],
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
									content: book.content ?? null,
									coverImage: book.coverImage ?? null,
									chapters: book.chapters ?? null,
									source: book.source ?? null,
									catalogId: book.catalogId ?? null,
									sourceUrl: book.sourceUrl ?? null,
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
									content: sql`COALESCE(excluded.content, sync_books.content)`,
									coverImage: sql`COALESCE(excluded.cover_image, sync_books.cover_image)`,
									chapters: sql`COALESCE(excluded.chapters, sync_books.chapters)`,
									source: sql`COALESCE(excluded.source, sync_books.source)`,
									catalogId: sql`COALESCE(excluded.catalog_id, sync_books.catalog_id)`,
									sourceUrl: sql`COALESCE(excluded.source_url, sync_books.source_url)`,
									updatedAt: sql`GREATEST(excluded.updated_at, sync_books.updated_at)`,
								},
							});
					}

					// --- Settings: upsert (fields extracted to avoid duplication) ---
					if (payload.settings) {
						const s = payload.settings;
						const settingsFields = {
							wpm: s.wpm,
							delayComma: s.delayComma,
							delayPeriod: s.delayPeriod,
							accelStart: s.accelStart,
							accelRate: s.accelRate,
							xOffset: s.xOffset,
							wordOffset: s.wordOffset,
							readerTheme: s.readerTheme,
							readerFontSize: s.readerFontSize,
							readerFontFamily: s.readerFontFamily,
							readerLineSpacing: s.readerLineSpacing,
							readerMargin: s.readerMargin,
							showReadingTime: s.showReadingTime,
							readerActiveWordUnderline: s.readerActiveWordUnderline,
							defaultReaderMode: s.defaultReaderMode,
							updatedAt: toDate(s.updatedAt),
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
				});

				// Return merged state - exclude content for books the client already has
				const clientBookIds = new Set(payload.books.map((b) => b.bookId));
				const data = await getUserSyncData(userId, clientBookIds);
				return Response.json(data);
			},
		},
	},
});
