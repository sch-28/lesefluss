import {
	bookStatus,
	PROFILE_SECTIONS,
	type ProfileBook,
	type ProfileCover,
	type ProfileFinishedBook,
	type ProfileSection,
	type ProfileView,
	readingProgress,
	SOCIAL_API,
} from "@lesefluss/core";
import { and, count, eq, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import { type DbExecutor, db } from "~/db";
import { socialFriendship, socialProfile, syncBooks, syncSeries } from "~/db/schema";
import { type CoverRef, signCoverToken } from "./cover-token";
import { SocialError } from "./errors";
import { dayOf, profileStatsFor } from "./profile-stats";
import {
	friendshipExists,
	identityOf,
	isSociallyVisible,
	loadSocialUsers,
	orderedPair,
} from "./relationship";

function coverUrl(ref: CoverRef, viewerId: string): string {
	return `${process.env.BETTER_AUTH_URL}${SOCIAL_API.coverImage}/${signCoverToken(ref, viewerId)}`;
}

export function coverFor(
	viewerId: string,
	catalogId: string | null,
	hasCover: boolean,
	ref: CoverRef,
): ProfileCover {
	if (catalogId) return { kind: "catalog", catalogId };
	if (hasCover) return { kind: "url", url: coverUrl(ref, viewerId) };
	return null;
}

type SeriesRollup = {
	title: string;
	author: string | null;
	wordCount: number;
	wordPosition: number;
	hasCover: boolean;
	isAnyReading: boolean;
	isAllFinished: boolean;
	finishedAt: Date | null;
	rating: number | null;
	movedAt: Date;
};

type Shelves = { currentlyReading: ProfileBook[]; finished: ProfileFinishedBook[] };

function loadShelfRows(exec: DbExecutor, ownerIds: string[]) {
	return exec
		.select({
			userId: syncBooks.userId,
			bookId: syncBooks.bookId,
			title: syncBooks.title,
			author: syncBooks.author,
			wordCount: syncBooks.wordCount,
			wordPosition: syncBooks.wordPosition,
			status: syncBooks.status,
			rating: syncBooks.rating,
			finishedAt: syncBooks.finishedAt,
			catalogId: syncBooks.catalogId,
			updatedAt: syncBooks.updatedAt,
			hasCover: isNotNull(syncBooks.coverImage),
			seriesId: syncBooks.seriesId,
			seriesTitle: syncSeries.title,
			seriesAuthor: syncSeries.author,
			seriesHasCover: isNotNull(syncSeries.coverImage),
		})
		.from(syncBooks)
		.leftJoin(
			syncSeries,
			and(eq(syncSeries.userId, syncBooks.userId), eq(syncSeries.seriesId, syncBooks.seriesId)),
		)
		.where(
			and(
				inArray(syncBooks.userId, ownerIds),
				eq(syncBooks.deleted, false),
				eq(syncBooks.hideFromProfile, false),
				or(isNull(syncBooks.source), ne(syncBooks.source, "url")),
			),
		);
}

type ShelfRow = Awaited<ReturnType<typeof loadShelfRows>>[number];

/**
 * Books as one entry per work: standalone books as themselves, serial chapters
 * rolled up per series. Articles, hidden and deleted books are out. Currently
 * reading comes most recently moved first.
 */
function shelvesFromRows(
	rows: ShelfRow[],
	ownerId: string,
	viewerId: string,
	timeZone: string | undefined,
): Shelves {
	const reading: { book: ProfileBook; movedAt: Date }[] = [];
	const finished: ProfileFinishedBook[] = [];
	const series = new Map<string, SeriesRollup>();

	for (const row of rows) {
		const wordCount = row.wordCount ?? 0;
		const status = bookStatus({ wordCount, wordPosition: row.wordPosition, status: row.status });
		if (row.seriesId) {
			if (row.seriesTitle === null) continue;
			const entry = series.get(row.seriesId) ?? {
				title: row.seriesTitle,
				author: row.seriesAuthor,
				wordCount: 0,
				wordPosition: 0,
				hasCover: Boolean(row.seriesHasCover),
				isAnyReading: false,
				isAllFinished: true,
				finishedAt: null,
				rating: null,
				movedAt: row.updatedAt,
			};
			entry.wordCount += wordCount;
			if (row.updatedAt > entry.movedAt) entry.movedAt = row.updatedAt;
			entry.wordPosition += Math.min(
				row.wordPosition,
				wordCount > 0 ? wordCount : row.wordPosition,
			);
			if (status === "reading") entry.isAnyReading = true;
			if (status !== "finished") entry.isAllFinished = false;
			if (row.finishedAt && (!entry.finishedAt || row.finishedAt > entry.finishedAt)) {
				entry.finishedAt = row.finishedAt;
			}
			if (row.rating !== null && entry.rating === null) entry.rating = row.rating;
			series.set(row.seriesId, entry);
			continue;
		}
		const cover = coverFor(viewerId, row.catalogId, Boolean(row.hasCover), {
			kind: "book",
			ownerId,
			id: row.bookId,
		});
		if (status === "reading") {
			reading.push({
				book: {
					key: row.bookId,
					title: row.title,
					author: row.author,
					progressPercent: readingProgress({ wordCount, wordPosition: row.wordPosition }),
					cover,
				},
				movedAt: row.updatedAt,
			});
		} else if (status === "finished") {
			finished.push({
				key: row.bookId,
				title: row.title,
				author: row.author,
				finishedOn: dayOf(row.finishedAt, timeZone),
				rating: row.rating,
				cover,
			});
		}
	}

	for (const [seriesId, entry] of series) {
		const cover = coverFor(viewerId, null, entry.hasCover, {
			kind: "series",
			ownerId,
			id: seriesId,
		});
		if (entry.isAllFinished && !entry.isAnyReading) {
			finished.push({
				key: seriesId,
				title: entry.title,
				author: entry.author,
				finishedOn: dayOf(entry.finishedAt, timeZone),
				rating: entry.rating,
				cover,
			});
		} else if (entry.isAnyReading || entry.wordPosition > 0) {
			reading.push({
				book: {
					key: seriesId,
					title: entry.title,
					author: entry.author,
					progressPercent: readingProgress(entry),
					cover,
				},
				movedAt: entry.movedAt,
			});
		}
	}

	reading.sort((a, b) => b.movedAt.getTime() - a.movedAt.getTime());
	finished.sort((a, b) => (b.finishedOn ?? "").localeCompare(a.finishedOn ?? ""));
	return { currentlyReading: reading.map((r) => r.book), finished };
}

async function shelvesFor(
	exec: DbExecutor,
	ownerId: string,
	viewerId: string,
	timeZone: string | undefined,
): Promise<Shelves> {
	return shelvesFromRows(await loadShelfRows(exec, [ownerId]), ownerId, viewerId, timeZone);
}

/**
 * The most recently read book of each of `friendIds` whose profile would show
 * it to `viewerId`. Callers pass only live friendships between visible users.
 */
export async function nowReadingFor(
	exec: DbExecutor,
	viewerId: string,
	friendIds: string[],
): Promise<Map<string, ProfileBook>> {
	const nowReading = new Map<string, ProfileBook>();
	if (friendIds.length === 0) return nowReading;
	const shown = await exec
		.select({ userId: socialProfile.userId })
		.from(socialProfile)
		.where(
			and(
				inArray(socialProfile.userId, friendIds),
				eq(socialProfile.visibility, "friends"),
				eq(socialProfile.showCurrentlyReading, true),
			),
		);
	if (shown.length === 0) return nowReading;
	const rowsByOwner = new Map<string, ShelfRow[]>();
	for (const row of await loadShelfRows(
		exec,
		shown.map((p) => p.userId),
	)) {
		const rows = rowsByOwner.get(row.userId);
		if (rows) rows.push(row);
		else rowsByOwner.set(row.userId, [row]);
	}
	for (const [ownerId, rows] of rowsByOwner) {
		const [latest] = shelvesFromRows(rows, ownerId, viewerId, undefined).currentlyReading;
		if (latest) nowReading.set(ownerId, latest);
	}
	return nowReading;
}

async function friendCountOf(exec: DbExecutor, userId: string): Promise<number> {
	const [row] = await exec
		.select({ n: count() })
		.from(socialFriendship)
		.where(or(eq(socialFriendship.userLow, userId), eq(socialFriendship.userHigh, userId)));
	return row?.n ?? 0;
}

export type ProfileViewOptions = {
	/** The owner previewing themselves as a friend would see them. */
	asFriend?: boolean;
	/** The viewer's zone, used only while the owner has none stored (owners on builds that never send it). */
	fallbackTimeZone?: string;
	now?: Date;
};

/**
 * What `viewerId` may see of `targetId`. Everything that must not leak (a
 * stranger, a block either way, a banned or handle-less owner, no such user)
 * collapses into `not_found`. No separate block check is needed: a block
 * deletes the friendship in the same transaction, so a live friendship row
 * already means no block exists.
 */
export async function resolveProfileView(
	viewerId: string,
	targetId: string,
	options: ProfileViewOptions = {},
): Promise<ProfileView> {
	const exec = db;
	const now = options.now ?? new Date();
	// Every not_found path runs the same two queries so response time does not
	// tell a stranger whether the target exists or is a friend of someone.
	const [low, high] = orderedPair(viewerId, targetId);
	const [users, [friendship]] = await Promise.all([
		loadSocialUsers(exec, [targetId, viewerId]),
		exec
			.select({ acceptedAt: socialFriendship.acceptedAt })
			.from(socialFriendship)
			.where(and(eq(socialFriendship.userLow, low), eq(socialFriendship.userHigh, high))),
	]);
	const owner = users.get(targetId);
	const viewer = users.get(viewerId);
	const isSelf = viewerId === targetId;
	const mayView =
		owner &&
		viewer &&
		isSociallyVisible(owner, now) &&
		(isSelf || (isSociallyVisible(viewer, now) && friendship));
	if (!mayView) throw new SocialError("not_found");
	const friendsSince = isSelf ? null : (friendship?.acceptedAt.getTime() ?? null);

	const [profile] = await exec
		.select()
		.from(socialProfile)
		.where(eq(socialProfile.userId, targetId));
	const relation: "self" | "friend" = isSelf && !options.asFriend ? "self" : "friend";
	const view: ProfileView = {
		header: { identity: identityOf(owner), relation, friendsSince },
		sections: {},
	};

	// The owner's dates and "this year" are theirs, whoever looks.
	const ownerZone = profile?.timeZone ?? options.fallbackTimeZone;
	const isShowingAll = relation === "self";
	if (!isShowingAll && (profile?.visibility ?? "private") !== "friends") return view;

	view.bio = profile?.bio ?? null;
	view.friendCount = await friendCountOf(exec, targetId);

	const isAllowed = (section: ProfileSection): boolean =>
		isShowingAll || (profile?.[PROFILE_SECTIONS[section]] ?? true);
	if (isAllowed("currentlyReading") || isAllowed("finished")) {
		const shelves = await shelvesFor(exec, targetId, viewerId, ownerZone);
		if (isAllowed("currentlyReading")) view.sections.currentlyReading = shelves.currentlyReading;
		if (isAllowed("finished")) view.sections.finished = shelves.finished;
	}
	if (isAllowed("stats")) {
		view.sections.stats = await profileStatsFor(exec, targetId, { timeZone: ownerZone, now });
	}
	return view;
}

/** Whether `viewerId` may load `ref`'s cover right now: own book, or a live friendship between two visible users. */
export async function mayViewCover(viewerId: string, ref: CoverRef): Promise<boolean> {
	if (viewerId === ref.ownerId) return true;
	const [users, isFriend] = await Promise.all([
		loadSocialUsers(db, [viewerId, ref.ownerId]),
		friendshipExists(db, viewerId, ref.ownerId),
	]);
	const now = new Date();
	const viewer = users.get(viewerId);
	const owner = users.get(ref.ownerId);
	return Boolean(
		isFriend && viewer && owner && isSociallyVisible(viewer, now) && isSociallyVisible(owner, now),
	);
}
