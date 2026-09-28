import {
	FEED_EVENT_SECTION,
	FEED_EVENT_TYPES,
	FEED_PAGE_SIZE,
	FEED_RETENTION_DAYS,
	type FeedEventType,
	type FeedItem,
	type FeedPage,
	PROFILE_SECTIONS,
} from "@lesefluss/core";
import { and, desc, eq, inArray, isNull, lt, ne, or, type SQL, sql } from "drizzle-orm";
import { db, type Tx } from "~/db";
import { socialFeedEvent, socialFriendship, socialProfile, syncBooks } from "~/db/schema";
import { isUuid } from "~/lib/uuid";
import { SocialError } from "./errors";
import { type FeedBookState, feedTransitions } from "./feed-transitions";
import { dayOf } from "./profile-stats";
import { coverFor } from "./profile-view";
import { identityOf, isSociallyVisible, loadSocialUsers } from "./relationship";

const DAY_MS = 86_400_000;
const CLEANUP_BATCH = 500;

/** Reading the feed and deleting from it are counted apart, so deletes never spend the reading budget. */
export const FEED_READ_LIMIT = { key: "social-feed", max: 120, windowMs: 60_000 };
export const FEED_DELETE_LIMIT = { key: "social-feed-delete", max: 60, windowMs: 60_000 };

/** The `sync_books` columns the transition check reads, before and after a push. */
export const feedBookColumns = {
	bookId: syncBooks.bookId,
	status: syncBooks.status,
	wordPosition: syncBooks.wordPosition,
	wordCount: syncBooks.wordCount,
	finishedAt: syncBooks.finishedAt,
	deleted: syncBooks.deleted,
	seriesId: syncBooks.seriesId,
	source: syncBooks.source,
};

/**
 * The stored state of the pushed books, read in a savepoint: a failing read
 * would otherwise abort the whole sync transaction. On failure this push
 * records no feed events, which is the intended degradation.
 */
export async function loadFeedBookStates(
	tx: Tx,
	userId: string,
	bookIds: readonly string[],
): Promise<Map<string, FeedBookState>> {
	if (bookIds.length === 0) return new Map();
	try {
		return await tx.transaction(async (sp) => {
			const rows = await sp
				.select(feedBookColumns)
				.from(syncBooks)
				.where(and(eq(syncBooks.userId, userId), inArray(syncBooks.bookId, [...bookIds])));
			return new Map(rows.map((row) => [row.bookId, row]));
		});
	} catch (err) {
		console.error("feed: reading the stored books failed", err);
		return new Map();
	}
}

/** Whether the actor's settings let this event type reach friends right now. */
function isPublished(
	profile: typeof socialProfile.$inferSelect | undefined,
	type: FeedEventType,
): boolean {
	if (!profile || profile.visibility !== "friends" || !profile.feedEnabled) return false;
	return profile[PROFILE_SECTIONS[FEED_EVENT_SECTION[type]]];
}

/**
 * Records the feed events a sync push produced. Runs in a savepoint and never
 * throws: a feed problem must not cost the user their sync.
 */
export async function recordFeedEvents(
	tx: Tx,
	userId: string,
	before: ReadonlyMap<string, FeedBookState>,
	after: readonly FeedBookState[],
	now = new Date(),
): Promise<void> {
	const transitions = feedTransitions(before, after, now);
	if (transitions.length === 0) return;
	try {
		await tx.transaction(async (sp) => {
			const [profile] = await sp
				.select()
				.from(socialProfile)
				.where(eq(socialProfile.userId, userId));
			const published = transitions.filter((t) => isPublished(profile, t.type));
			if (published.length === 0) return;
			await sp
				.insert(socialFeedEvent)
				.values(published.map((t) => ({ actorId: userId, ...t, createdAt: now })))
				.onConflictDoNothing();
		});
	} catch (err) {
		console.error("feed: recording failed", err);
	}
}

/** Read-time check per event type: the section it belongs to must still be visible to friends. */
function sectionVisible(): SQL {
	return or(
		...FEED_EVENT_TYPES.map((type) => {
			const column = socialProfile[PROFILE_SECTIONS[FEED_EVENT_SECTION[type]]];
			return and(eq(socialFeedEvent.type, type), eq(column, true));
		}),
	) as SQL;
}

type Cursor = { createdAt: Date; id: string };

function encodeCursor(cursor: Cursor): string {
	return Buffer.from(`${cursor.createdAt.toISOString()}|${cursor.id}`).toString("base64url");
}

function decodeCursor(raw: string | null): Cursor | null {
	if (!raw) return null;
	const [iso, id] = Buffer.from(raw, "base64url").toString().split("|");
	const createdAt = iso ? new Date(iso) : null;
	if (!createdAt || Number.isNaN(createdAt.getTime()) || !id || !isUuid(id)) {
		throw new SocialError("invalid");
	}
	return { createdAt, id };
}

async function friendIdsOf(userId: string): Promise<string[]> {
	const rows = await db
		.select({ low: socialFriendship.userLow, high: socialFriendship.userHigh })
		.from(socialFriendship)
		.where(or(eq(socialFriendship.userLow, userId), eq(socialFriendship.userHigh, userId)));
	return rows.map((r) => (r.low === userId ? r.high : r.low));
}

/**
 * The viewer's own events and those of current friends, newest first. A block
 * deletes the friendship, so it needs no separate check; banned and
 * handle-less actors drop out through `isSociallyVisible`.
 */
export async function listFeed(
	viewerId: string,
	options: { cursor?: string | null; timeZone?: string; now?: Date } = {},
): Promise<FeedPage> {
	const now = options.now ?? new Date();
	const cursor = decodeCursor(options.cursor ?? null);
	const cutoff = new Date(now.getTime() - FEED_RETENTION_DAYS * DAY_MS);

	await db
		.delete(socialFeedEvent)
		.where(
			inArray(
				socialFeedEvent.id,
				db
					.select({ id: socialFeedEvent.id })
					.from(socialFeedEvent)
					.where(lt(socialFeedEvent.createdAt, cutoff))
					.limit(CLEANUP_BATCH),
			),
		);

	const candidates = [viewerId, ...(await friendIdsOf(viewerId))];
	const users = await loadSocialUsers(db, candidates);
	const actors = candidates.filter((id) => {
		const u = users.get(id);
		return u && (id === viewerId || isSociallyVisible(u, now));
	});
	if (actors.length === 0) return { items: [], nextCursor: null };

	const rows = await db
		.select({
			id: socialFeedEvent.id,
			type: socialFeedEvent.type,
			createdAt: socialFeedEvent.createdAt,
			actorId: socialFeedEvent.actorId,
			bookId: socialFeedEvent.bookId,
			title: syncBooks.title,
			author: syncBooks.author,
			catalogId: syncBooks.catalogId,
			rating: syncBooks.rating,
			hasCover: sql<boolean>`${syncBooks.coverImage} IS NOT NULL`,
		})
		.from(socialFeedEvent)
		.innerJoin(
			syncBooks,
			and(
				eq(syncBooks.userId, socialFeedEvent.actorId),
				eq(syncBooks.bookId, socialFeedEvent.bookId),
				eq(syncBooks.deleted, false),
				eq(syncBooks.hideFromProfile, false),
				or(isNull(syncBooks.source), ne(syncBooks.source, "url")),
			),
		)
		.leftJoin(socialProfile, eq(socialProfile.userId, socialFeedEvent.actorId))
		.where(
			and(
				inArray(socialFeedEvent.actorId, actors),
				sql`${socialFeedEvent.createdAt} >= ${cutoff.toISOString()}`,
				or(
					eq(socialFeedEvent.actorId, viewerId),
					and(
						eq(socialProfile.visibility, "friends"),
						eq(socialProfile.feedEnabled, true),
						sectionVisible(),
					),
				),
				cursor
					? sql`(${socialFeedEvent.createdAt}, ${socialFeedEvent.id}) < (${cursor.createdAt.toISOString()}::timestamp, ${cursor.id}::uuid)`
					: undefined,
			),
		)
		.orderBy(desc(socialFeedEvent.createdAt), desc(socialFeedEvent.id))
		.limit(FEED_PAGE_SIZE + 1);

	const page = rows.slice(0, FEED_PAGE_SIZE);
	const items: FeedItem[] = page.flatMap((row) => {
		const actor = users.get(row.actorId);
		if (!actor) return [];
		return [
			{
				id: row.id,
				type: row.type,
				isOwn: row.actorId === viewerId,
				actor: identityOf(actor),
				day: dayOf(row.createdAt, options.timeZone) ?? "",
				book: {
					title: row.title,
					author: row.author,
					catalogId: row.catalogId,
					cover: coverFor(viewerId, row.catalogId, row.hasCover, {
						kind: "book",
						ownerId: row.actorId,
						id: row.bookId,
					}),
					rating: row.type === "finished" ? row.rating : null,
				},
			},
		];
	});
	const last = page[page.length - 1];
	return {
		items,
		nextCursor: rows.length > FEED_PAGE_SIZE && last ? encodeCursor(last) : null,
	};
}

/** Only the actor can remove an event; another user's id changes nothing and reports nothing. */
export async function deleteFeedEvent(userId: string, eventId: string): Promise<void> {
	await db
		.delete(socialFeedEvent)
		.where(and(eq(socialFeedEvent.id, eventId), eq(socialFeedEvent.actorId, userId)));
}
