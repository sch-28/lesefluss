import {
	BUDDY_READ_INVITE_TTL_DAYS,
	BUDDY_READ_MAX_PARTICIPANTS,
	type BuddyReadDetail,
	type BuddyReadInviteSummary,
	type BuddyReadParticipant,
	type BuddyReadProgress,
	type BuddyReadSummary,
	type CreateBuddyReadBody,
	FINISHED_PERCENT_THRESHOLD,
	FRIEND_REQUEST_TTL_DAYS,
	type RelationshipState,
	readingProgress,
} from "@lesefluss/core";
import { and, asc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { type DbExecutor, db, type Tx } from "~/db";
import {
	type BuddyRead,
	type BuddyReadInvite,
	buddyRead,
	buddyReadInvite,
	buddyReadMember,
	socialBlock,
	socialFriendRequest,
	socialFriendship,
	syncBooks,
} from "~/db/schema";
import { isSharingSuspended } from "~/lib/moderation/restrictions";
import { isOriginTakenDown } from "~/lib/moderation/takedown";
import { originKey } from "~/lib/origin";
import { copyBookForUser, liveCopyOf, shareableSource } from "./copy-book";
import { SocialError } from "./errors";
import { lockUsers } from "./friends";
import { createNotification, deleteNotificationsForSubject, markSubjectRead } from "./inbox";
import {
	areFriends,
	identityOf,
	isBanned,
	isSociallyVisible,
	loadSocialUsers,
	type SocialUser,
} from "./relationship";
import "./buddy-read-hooks";

const DAY_MS = 86_400_000;

export function inviteExpiryCutoff(now: Date): Date {
	return new Date(now.getTime() - BUDDY_READ_INVITE_TTL_DAYS * DAY_MS);
}

type Member = {
	userId: string;
	bookId: string;
	state: "active" | "left" | "removed";
	joinedAt: Date;
	finishArmed: boolean;
	finishedAt: Date | null;
	/** Null when the linked book is missing or tombstoned. */
	book: { wordPosition: number; wordCount: number | null; updatedAt: Date } | null;
};

export type ReadState = {
	read: BuddyRead;
	takenDown: boolean;
	/**
	 * Members who count: active with a live book. A takedown tombstones every
	 * copy, so then every active member counts regardless; they see only that
	 * the book is gone.
	 */
	current: Member[];
	/** Active members whose linked book is gone; they count as having left. */
	gone: Member[];
	users: Map<string, SocialUser>;
	hostId: string | null;
};

function percentOf(book: { wordPosition: number; wordCount: number | null } | null): number | null {
	if (!book?.wordCount) return null;
	return readingProgress({ wordCount: book.wordCount, wordPosition: book.wordPosition });
}

async function loadMembers(exec: DbExecutor, readId: string): Promise<Member[]> {
	const rows = await exec
		.select({
			userId: buddyReadMember.userId,
			bookId: buddyReadMember.bookId,
			state: buddyReadMember.state,
			joinedAt: buddyReadMember.joinedAt,
			finishArmed: buddyReadMember.finishArmed,
			finishedAt: buddyReadMember.finishedAt,
			wordPosition: syncBooks.wordPosition,
			wordCount: syncBooks.wordCount,
			updatedAt: syncBooks.updatedAt,
		})
		.from(buddyReadMember)
		.leftJoin(
			syncBooks,
			and(
				eq(syncBooks.userId, buddyReadMember.userId),
				eq(syncBooks.bookId, buddyReadMember.bookId),
				eq(syncBooks.deleted, false),
			),
		)
		.where(and(eq(buddyReadMember.buddyReadId, readId), eq(buddyReadMember.state, "active")))
		.orderBy(asc(buddyReadMember.joinedAt), asc(buddyReadMember.userId));
	return rows.map((r) => ({
		userId: r.userId,
		bookId: r.bookId,
		state: r.state,
		joinedAt: r.joinedAt,
		finishArmed: r.finishArmed,
		finishedAt: r.finishedAt,
		book:
			r.wordPosition !== null && r.updatedAt !== null
				? { wordPosition: r.wordPosition, wordCount: r.wordCount, updatedAt: r.updatedAt }
				: null,
	}));
}

/** The stored host while they count and are not banned, else the earliest-joined member who is. */
function effectiveHost(
	read: BuddyRead,
	current: Member[],
	users: Map<string, SocialUser>,
	now: Date,
): string | null {
	const eligible = current.filter((m) => {
		const u = users.get(m.userId);
		return u && !isBanned(u, now);
	});
	if (eligible.some((m) => m.userId === read.hostId)) return read.hostId;
	return eligible[0]?.userId ?? current[0]?.userId ?? null;
}

export async function loadState(exec: DbExecutor, read: BuddyRead, now: Date): Promise<ReadState> {
	const [members, takenDown] = await Promise.all([
		loadMembers(exec, read.id),
		isOriginTakenDown(read.originUserId, read.originBookId, exec),
	]);
	const current = takenDown ? members : members.filter((m) => m.book !== null);
	const gone = takenDown ? [] : members.filter((m) => m.book === null);
	const users = await loadSocialUsers(
		exec,
		current.map((m) => m.userId),
	);
	return {
		read,
		takenDown,
		current,
		gone,
		users,
		hostId: effectiveHost(read, current, users, now),
	};
}

async function lockRead(tx: Tx, readId: string): Promise<BuddyRead | null> {
	const [read] = await tx.select().from(buddyRead).where(eq(buddyRead.id, readId)).for("update");
	return read ?? null;
}

/**
 * Brings a locked read up to date: members whose book is gone are marked as
 * left, finishes are recorded, an empty read is deleted and a read whose every
 * member finished becomes finished. Returns null when the read is gone.
 */
async function settle(tx: Tx, read: BuddyRead, now: Date): Promise<ReadState | null> {
	let state = await loadState(tx, read, now);
	if (state.gone.length > 0) {
		await tx
			.update(buddyReadMember)
			.set({ state: "left", leftAt: now })
			.where(
				and(
					eq(buddyReadMember.buddyReadId, read.id),
					inArray(
						buddyReadMember.userId,
						state.gone.map((m) => m.userId),
					),
				),
			);
	}
	if (state.current.length === 0) {
		await tx.delete(buddyRead).where(eq(buddyRead.id, read.id));
		return null;
	}
	if (!state.takenDown && read.status === "in_progress") {
		for (const member of state.current) {
			if (member.finishedAt) continue;
			const percent = percentOf(member.book);
			if (percent === null) continue;
			if (percent < FINISHED_PERCENT_THRESHOLD) {
				if (!member.finishArmed) {
					await setMember(tx, read.id, member.userId, { finishArmed: true });
					member.finishArmed = true;
				}
			} else if (member.finishArmed) {
				await setMember(tx, read.id, member.userId, { finishedAt: now });
				member.finishedAt = now;
				for (const other of state.current) {
					if (other.userId === member.userId) continue;
					await createNotification(
						tx,
						{
							recipientId: other.userId,
							actorId: member.userId,
							type: "buddy_read_finished",
							subjectId: read.id,
						},
						now,
					);
				}
			}
		}
		if (state.current.every((m) => m.finishedAt !== null)) {
			const [finished] = await tx
				.update(buddyRead)
				.set({ status: "finished", finishedAt: now })
				.where(eq(buddyRead.id, read.id))
				.returning();
			if (finished) state = { ...state, read: finished };
		}
	}
	if (state.hostId && state.hostId !== state.read.hostId) {
		await tx.update(buddyRead).set({ hostId: state.hostId }).where(eq(buddyRead.id, read.id));
		state = { ...state, read: { ...state.read, hostId: state.hostId } };
	}
	return state;
}

async function setMember(
	tx: Tx,
	readId: string,
	userId: string,
	values: Partial<typeof buddyReadMember.$inferInsert>,
): Promise<void> {
	await tx
		.update(buddyReadMember)
		.set(values)
		.where(and(eq(buddyReadMember.buddyReadId, readId), eq(buddyReadMember.userId, userId)));
}

/** Locks and settles a read the caller must currently belong to. */
async function openAsMember(tx: Tx, userId: string, readId: string, now: Date): Promise<ReadState> {
	const read = await lockRead(tx, readId);
	const state = read ? await settle(tx, read, now) : null;
	if (!state?.current.some((m) => m.userId === userId)) {
		throw new SocialError("not_found");
	}
	return state;
}

function requireHost(state: ReadState, userId: string): void {
	if (state.hostId !== userId) throw new SocialError("not_host");
}

async function pendingInvites(exec: DbExecutor, readId: string, now: Date) {
	return exec
		.select()
		.from(buddyReadInvite)
		.where(
			and(
				eq(buddyReadInvite.buddyReadId, readId),
				eq(buddyReadInvite.status, "pending"),
				gt(buddyReadInvite.createdAt, inviteExpiryCutoff(now)),
			),
		);
}

/** Pending invites that still hold a seat: unexpired, from someone who still counts. */
async function seatHoldingInvites(exec: DbExecutor, state: ReadState, now: Date) {
	const members = new Set(state.current.map((m) => m.userId));
	return (await pendingInvites(exec, state.read.id, now)).filter((i) => members.has(i.inviterId));
}

async function inviteWithin(
	tx: Tx,
	state: ReadState,
	inviterId: string,
	inviteeIds: readonly string[],
	now: Date,
): Promise<void> {
	const ids = [...new Set(inviteeIds)].filter((id) => id !== inviterId);
	if (ids.length === 0) return;
	const members = new Set(state.current.map((m) => m.userId));
	const holding = await seatHoldingInvites(tx, state, now);
	const invited = new Set(holding.map((i) => i.inviteeId));
	const fresh: string[] = [];
	for (const id of ids) {
		if (!(await areFriends(tx, inviterId, id, now))) throw new SocialError("not_found");
		if (members.has(id)) throw new SocialError("already_member");
		if (!invited.has(id)) fresh.push(id);
	}
	if (members.size + holding.length + fresh.length > BUDDY_READ_MAX_PARTICIPANTS) {
		throw new SocialError("full");
	}
	for (const inviteeId of fresh) {
		// An old pending row (expired, or from a member who left) would collide with
		// the pending-only unique index; it closes as cancelled.
		const stale = await tx
			.update(buddyReadInvite)
			.set({ status: "cancelled", resolvedAt: now })
			.where(
				and(
					eq(buddyReadInvite.buddyReadId, state.read.id),
					eq(buddyReadInvite.inviteeId, inviteeId),
					eq(buddyReadInvite.status, "pending"),
				),
			)
			.returning({ id: buddyReadInvite.id });
		for (const s of stale) await deleteNotificationsForSubject(tx, "buddy_read_invite", s.id);
		const [invite] = await tx
			.insert(buddyReadInvite)
			.values({ buddyReadId: state.read.id, inviterId, inviteeId, createdAt: now })
			.returning({ id: buddyReadInvite.id });
		if (!invite) throw new Error("invite insert returned nothing");
		await createNotification(
			tx,
			{
				recipientId: inviteeId,
				actorId: inviterId,
				type: "buddy_read_invite",
				subjectId: invite.id,
			},
			now,
		);
	}
}

async function positionOf(tx: Tx, userId: string, bookId: string) {
	const [row] = await tx
		.select({ wordPosition: syncBooks.wordPosition, wordCount: syncBooks.wordCount })
		.from(syncBooks)
		.where(and(eq(syncBooks.userId, userId), eq(syncBooks.bookId, bookId)));
	return row ?? null;
}

/** A member joining with a book they already finished must go below the threshold first. */
function armedAtJoin(book: { wordPosition: number; wordCount: number | null } | null): boolean {
	const percent = percentOf(book);
	return percent === null || percent < FINISHED_PERCENT_THRESHOLD;
}

export async function createBuddyRead(
	hostId: string,
	body: CreateBuddyReadBody,
	now = new Date(),
): Promise<{ buddyReadId: string }> {
	return db.transaction(async (tx) => {
		// Serializes a double-tap: the running-read check below has no index behind it.
		await lockUsers(tx, hostId);
		if (await isSharingSuspended(hostId, now, tx)) throw new SocialError("suspended");
		const source = await shareableSource(tx, hostId, body.bookId);
		if (!source || (await isOriginTakenDown(source.originUserId, source.originBookId, tx))) {
			throw new SocialError("not_shareable");
		}
		const [running] = await tx
			.select({ id: buddyRead.id })
			.from(buddyRead)
			.innerJoin(buddyReadMember, eq(buddyReadMember.buddyReadId, buddyRead.id))
			.where(
				and(
					eq(buddyRead.originUserId, source.originUserId),
					eq(buddyRead.originBookId, source.originBookId),
					eq(buddyRead.status, "in_progress"),
					eq(buddyReadMember.userId, hostId),
					eq(buddyReadMember.state, "active"),
				),
			)
			.limit(1);
		if (running) throw new SocialError("already_member");

		const [read] = await tx
			.insert(buddyRead)
			.values({
				originUserId: source.originUserId,
				originBookId: source.originBookId,
				hostId,
				title: source.title,
				author: source.author,
				createdAt: now,
			})
			.returning();
		if (!read) throw new Error("buddy read insert returned nothing");
		const book = await positionOf(tx, hostId, body.bookId);
		await tx.insert(buddyReadMember).values({
			buddyReadId: read.id,
			userId: hostId,
			bookId: body.bookId,
			joinedAt: now,
			finishArmed: armedAtJoin(book),
		});
		const state = await loadState(tx, read, now);
		await inviteWithin(tx, state, hostId, body.inviteeIds, now);
		return { buddyReadId: read.id };
	});
}

function refuseChanges(state: ReadState): void {
	if (state.takenDown || state.read.status !== "in_progress") throw new SocialError("unavailable");
}

export async function inviteToBuddyRead(
	hostId: string,
	readId: string,
	inviteeIds: readonly string[],
	now = new Date(),
): Promise<void> {
	await db.transaction(async (tx) => {
		const state = await openAsMember(tx, hostId, readId, now);
		requireHost(state, hostId);
		refuseChanges(state);
		if (await isSharingSuspended(hostId, now, tx)) throw new SocialError("suspended");
		await inviteWithin(tx, state, hostId, inviteeIds, now);
	});
}

export async function cancelBuddyReadInvite(
	hostId: string,
	inviteId: string,
	now = new Date(),
): Promise<void> {
	await db.transaction(async (tx) => {
		const [invite] = await tx
			.select()
			.from(buddyReadInvite)
			.where(eq(buddyReadInvite.id, inviteId));
		if (!invite) throw new SocialError("not_found");
		const state = await openAsMember(tx, hostId, invite.buddyReadId, now);
		requireHost(state, hostId);
		const [cancelled] = await tx
			.update(buddyReadInvite)
			.set({ status: "cancelled", resolvedAt: now })
			.where(and(eq(buddyReadInvite.id, inviteId), eq(buddyReadInvite.status, "pending")))
			.returning({ id: buddyReadInvite.id });
		if (!cancelled) throw new SocialError("not_found");
		await deleteNotificationsForSubject(tx, "buddy_read_invite", inviteId);
	});
}

/**
 * Why a pending invite can no longer be taken, collapsed into one answer: the
 * read ended or finished, the inviter no longer counts, the two are no longer
 * friends (which covers blocks and bans) or the invite is too old.
 */
export async function isInviteVoid(
	exec: DbExecutor,
	invite: BuddyReadInvite,
	state: ReadState | null,
	now: Date,
): Promise<boolean> {
	if (!state || state.takenDown || state.read.status !== "in_progress") return true;
	if (invite.createdAt <= inviteExpiryCutoff(now)) return true;
	if (!state.current.some((m) => m.userId === invite.inviterId)) return true;
	return !(await areFriends(exec, invite.inviterId, invite.inviteeId, now));
}

/** The book a joiner without their own copy receives: the host's, else any member's that is still shareable. */
async function copySource(tx: Tx, state: ReadState) {
	const candidates = [...state.current].sort((a, b) =>
		a.userId === state.hostId ? -1 : b.userId === state.hostId ? 1 : 0,
	);
	for (const member of candidates) {
		if (await shareableSource(tx, member.userId, member.bookId)) return member;
	}
	return null;
}

export async function respondToBuddyReadInvite(
	userId: string,
	inviteId: string,
	action: "accept" | "decline",
	now = new Date(),
): Promise<{ buddyReadId: string; bookId: string | null }> {
	return db.transaction(async (tx) => {
		const [found] = await tx
			.select({ buddyReadId: buddyReadInvite.buddyReadId })
			.from(buddyReadInvite)
			.where(and(eq(buddyReadInvite.id, inviteId), eq(buddyReadInvite.inviteeId, userId)));
		if (!found) throw new SocialError("not_found");
		const locked = await lockRead(tx, found.buddyReadId);
		const [invite] = await tx
			.select()
			.from(buddyReadInvite)
			.where(and(eq(buddyReadInvite.id, inviteId), eq(buddyReadInvite.status, "pending")));
		if (!locked || !invite) throw new SocialError("not_found");
		const state = await settle(tx, locked, now);

		if (action === "decline") {
			const declined = await tx
				.update(buddyReadInvite)
				.set({ status: "declined", resolvedAt: now })
				.where(eq(buddyReadInvite.id, inviteId))
				.returning({ id: buddyReadInvite.id });
			if (declined.length === 0) throw new SocialError("not_found");
			await markSubjectRead(tx, "buddy_read_invite", inviteId, now);
			return { buddyReadId: invite.buddyReadId, bookId: null };
		}

		if (!state || (await isInviteVoid(tx, invite, state, now))) {
			throw new SocialError("unavailable");
		}
		const existingMember = state.current.find((m) => m.userId === userId);
		let bookId = existingMember?.bookId ?? null;
		if (!existingMember) {
			if (state.current.length >= BUDDY_READ_MAX_PARTICIPANTS) throw new SocialError("full");
			const origin = {
				originUserId: state.read.originUserId,
				originBookId: state.read.originBookId,
			};
			bookId = await liveCopyOf(tx, userId, origin);
			if (!bookId) {
				if (await isSharingSuspended(invite.inviterId, now, tx)) {
					throw new SocialError("unavailable");
				}
				const source = await copySource(tx, state);
				if (!source) throw new SocialError("unavailable");
				const copy = await copyBookForUser(tx, {
					sourceUserId: source.userId,
					sourceBookId: source.bookId,
					recipientId: userId,
					via: "buddy_read",
					now,
				});
				bookId = copy.bookId;
			}
			const book = await positionOf(tx, userId, bookId);
			const joined = {
				bookId,
				state: "active" as const,
				joinedAt: now,
				leftAt: null,
				finishArmed: armedAtJoin(book),
				finishedAt: null,
			};
			await tx
				.insert(buddyReadMember)
				.values({ buddyReadId: state.read.id, userId, ...joined })
				.onConflictDoUpdate({
					target: [buddyReadMember.buddyReadId, buddyReadMember.userId],
					set: joined,
				});
			for (const other of state.current) {
				await createNotification(
					tx,
					{
						recipientId: other.userId,
						actorId: userId,
						type: "buddy_read_joined",
						subjectId: state.read.id,
					},
					now,
				);
			}
		}
		await tx
			.update(buddyReadInvite)
			.set({ status: "accepted", resolvedAt: now })
			.where(eq(buddyReadInvite.id, inviteId));
		await markSubjectRead(tx, "buddy_read_invite", inviteId, now);
		return { buddyReadId: state.read.id, bookId };
	});
}

async function endMembership(
	tx: Tx,
	state: ReadState,
	userId: string,
	how: "left" | "removed",
	now: Date,
): Promise<void> {
	await setMember(tx, state.read.id, userId, { state: how, leftAt: now });
	await settle(tx, state.read, now);
}

export async function leaveBuddyRead(userId: string, readId: string, now = new Date()) {
	await db.transaction(async (tx) => {
		const state = await openAsMember(tx, userId, readId, now);
		await endMembership(tx, state, userId, "left", now);
	});
}

export async function removeBuddyReadMember(
	hostId: string,
	readId: string,
	targetId: string,
	now = new Date(),
): Promise<void> {
	await db.transaction(async (tx) => {
		const state = await openAsMember(tx, hostId, readId, now);
		requireHost(state, hostId);
		const visible = await visibleTo(tx, hostId, state.users, now);
		if (targetId === hostId || !visible.has(targetId)) throw new SocialError("not_found");
		if (!state.current.some((m) => m.userId === targetId)) throw new SocialError("not_found");
		await endMembership(tx, state, targetId, "removed", now);
	});
}

export async function setBuddyReadTargetDate(
	hostId: string,
	readId: string,
	targetDate: number | null,
	now = new Date(),
): Promise<void> {
	await db.transaction(async (tx) => {
		const state = await openAsMember(tx, hostId, readId, now);
		requireHost(state, hostId);
		refuseChanges(state);
		await tx
			.update(buddyRead)
			.set({ targetDate: targetDate === null ? null : new Date(targetDate) })
			.where(eq(buddyRead.id, readId));
	});
}

/**
 * Records finishes for the pushed books. Runs after the sync push has
 * committed, so a failure here can never fail a sync.
 */
export async function settleBuddyReads(
	userId: string,
	bookIds: readonly string[],
	now = new Date(),
): Promise<void> {
	if (bookIds.length === 0) return;
	const rows = await db
		.select({ id: buddyReadMember.buddyReadId })
		.from(buddyReadMember)
		.where(
			and(
				eq(buddyReadMember.userId, userId),
				eq(buddyReadMember.state, "active"),
				isNull(buddyReadMember.finishedAt),
				inArray(buddyReadMember.bookId, [...bookIds]),
			),
		);
	for (const { id } of rows) await refresh(id, now);
}

async function refresh(readId: string, now: Date): Promise<ReadState | null> {
	return db.transaction(async (tx) => {
		const read = await lockRead(tx, readId);
		return read ? settle(tx, read, now) : null;
	});
}

/** Ends every membership of a user whose books are all gone (cloud wipe, account deletion) and deletes reads left empty. */
export async function endBuddyReadsOf(tx: Tx, userId: string, now = new Date()): Promise<void> {
	const ended = await tx
		.update(buddyReadMember)
		.set({ state: "left", leftAt: now })
		.where(and(eq(buddyReadMember.userId, userId), eq(buddyReadMember.state, "active")))
		.returning({ id: buddyReadMember.buddyReadId });
	// Sorted like lockUsers: two purges sharing reads must lock them in one order.
	for (const id of [...new Set(ended.map((e) => e.id))].sort()) {
		const read = await lockRead(tx, id);
		if (read) await settle(tx, read, now);
	}
}

/** Who the viewer may see: visible users with no block either way. The viewer always sees themselves. */
export async function visibleTo(
	exec: DbExecutor,
	viewerId: string,
	users: Map<string, SocialUser>,
	now: Date,
): Promise<Set<string>> {
	const others = [...users.keys()].filter((id) => id !== viewerId);
	const blocks =
		others.length === 0
			? []
			: await exec
					.select({ blockerId: socialBlock.blockerId, blockedId: socialBlock.blockedId })
					.from(socialBlock)
					.where(
						or(
							and(eq(socialBlock.blockerId, viewerId), inArray(socialBlock.blockedId, others)),
							and(eq(socialBlock.blockedId, viewerId), inArray(socialBlock.blockerId, others)),
						),
					);
	const blocked = new Set(
		blocks.map((b) => (b.blockerId === viewerId ? b.blockedId : b.blockerId)),
	);
	const out = new Set<string>([viewerId]);
	for (const id of others) {
		const u = users.get(id);
		if (u && isSociallyVisible(u, now) && !blocked.has(id)) out.add(id);
	}
	return out;
}

/** The viewer's side of each relationship; the viewer's own declined request still reads as pending. */
async function relationshipsWith(
	exec: DbExecutor,
	viewerId: string,
	ids: string[],
	now: Date,
): Promise<Map<string, RelationshipState>> {
	const out = new Map<string, RelationshipState>(ids.map((id) => [id, "none"]));
	if (ids.length === 0) return out;
	const pendingCutoff = new Date(now.getTime() - FRIEND_REQUEST_TTL_DAYS * DAY_MS);
	const [friendships, requests] = await Promise.all([
		exec
			.select()
			.from(socialFriendship)
			.where(
				or(
					and(eq(socialFriendship.userLow, viewerId), inArray(socialFriendship.userHigh, ids)),
					and(eq(socialFriendship.userHigh, viewerId), inArray(socialFriendship.userLow, ids)),
				),
			),
		exec
			.select()
			.from(socialFriendRequest)
			.where(
				or(
					and(
						eq(socialFriendRequest.requesterId, viewerId),
						inArray(socialFriendRequest.addresseeId, ids),
					),
					and(
						eq(socialFriendRequest.addresseeId, viewerId),
						inArray(socialFriendRequest.requesterId, ids),
						eq(socialFriendRequest.state, "pending"),
					),
				),
			),
	]);
	for (const r of requests) {
		const pending = r.state === "pending" && r.createdAt > pendingCutoff;
		if (r.requesterId === viewerId && (pending || r.state === "declined")) {
			out.set(r.addresseeId, "pending_outgoing");
		} else if (r.addresseeId === viewerId && pending) {
			out.set(r.requesterId, "pending_incoming");
		}
	}
	for (const f of friendships) out.set(f.userLow === viewerId ? f.userHigh : f.userLow, "friends");
	return out;
}

function identityIfVisible(state: ReadState, visible: Set<string>, userId: string | null) {
	if (!userId || !visible.has(userId)) return null;
	const u = state.users.get(userId);
	return u ? identityOf(u) : null;
}

async function summaryOf(
	exec: DbExecutor,
	state: ReadState,
	viewerId: string,
	visible: Set<string>,
	now: Date,
): Promise<BuddyReadSummary> {
	const me = state.current.find((m) => m.userId === viewerId);
	const isHost = state.hostId === viewerId;
	return {
		id: state.read.id,
		originKey: originKey(state.read),
		title: state.read.title,
		author: state.read.author,
		status: state.read.status,
		host: identityIfVisible(state, visible, state.hostId),
		memberCount: state.current.filter((m) => visible.has(m.userId)).length,
		pendingInvites: isHost ? (await seatHoldingInvites(exec, state, now)).length : 0,
		targetDate: state.read.targetDate?.getTime() ?? null,
		myBookId: me?.bookId ?? "",
		createdAt: state.read.createdAt.getTime(),
		finishedAt: state.read.finishedAt?.getTime() ?? null,
		originUnavailable: state.takenDown,
		members: state.takenDown
			? []
			: state.current.flatMap((m) => {
					const u = visible.has(m.userId) ? state.users.get(m.userId) : undefined;
					return u
						? [
								{
									identity: identityOf(u),
									isSelf: m.userId === viewerId,
									percent: percentOf(m.book),
									finished: m.finishedAt !== null,
								},
							]
						: [];
				}),
	};
}

export async function listBuddyReads(
	userId: string,
	now = new Date(),
): Promise<BuddyReadSummary[]> {
	const rows = await db
		.select({ id: buddyReadMember.buddyReadId })
		.from(buddyReadMember)
		.where(and(eq(buddyReadMember.userId, userId), eq(buddyReadMember.state, "active")));
	const out: BuddyReadSummary[] = [];
	for (const { id } of rows) {
		const state = await refresh(id, now);
		if (!state?.current.some((m) => m.userId === userId)) continue;
		const visible = await visibleTo(db, userId, state.users, now);
		out.push(await summaryOf(db, state, userId, visible, now));
	}
	return out.sort((a, b) => b.createdAt - a.createdAt);
}

async function stateForMember(userId: string, readId: string, now: Date): Promise<ReadState> {
	const state = await refresh(readId, now);
	if (!state?.current.some((m) => m.userId === userId)) {
		throw new SocialError("not_found");
	}
	return state;
}

/** Word counts that differ mean positions were tokenized differently and do not compare exactly. */
function isApproximate(members: Member[]): boolean {
	const counts = new Set(members.map((m) => m.book?.wordCount).filter((n) => n != null));
	return counts.size > 1;
}

export async function getBuddyRead(
	userId: string,
	readId: string,
	now = new Date(),
): Promise<BuddyReadDetail> {
	const state = await stateForMember(userId, readId, now);
	const visible = await visibleTo(db, userId, state.users, now);
	const summary = await summaryOf(db, state, userId, visible, now);
	const isHost = state.hostId === userId;
	if (state.takenDown) {
		return {
			...summary,
			isHost,
			approximate: false,
			participants: [],
			invites: [],
		};
	}
	const shown = state.current.filter((m) => visible.has(m.userId));
	const relationships = await relationshipsWith(
		db,
		userId,
		shown.map((m) => m.userId).filter((id) => id !== userId),
		now,
	);
	const participants: BuddyReadParticipant[] = [];
	for (const m of shown) {
		const u = state.users.get(m.userId);
		if (!u) continue;
		const relationship = relationships.get(m.userId) ?? "none";
		participants.push({
			identity: identityOf(u),
			isSelf: m.userId === userId,
			isHost: m.userId === state.hostId,
			isFriend: relationship === "friends",
			relationship,
			percent: percentOf(m.book),
			wordPosition: m.book?.wordPosition ?? 0,
			wordCount: m.book?.wordCount ?? null,
			// The revision is client-supplied; a device clock ahead of ours must not read as "in the future".
			lastActiveAt: m.book ? Math.min(m.book.updatedAt.getTime(), now.getTime()) : null,
			finishedAt: m.finishedAt?.getTime() ?? null,
		});
	}
	let invites: BuddyReadInviteSummary[] = [];
	if (isHost) {
		const holding = await seatHoldingInvites(db, state, now);
		const invitees = await loadSocialUsers(
			db,
			holding.map((i) => i.inviteeId),
		);
		// A handed-over host may be blocked with someone the previous host invited.
		const shownInvitees = await visibleTo(db, userId, invitees, now);
		invites = holding.flatMap((i) => {
			const u = invitees.get(i.inviteeId);
			return u && shownInvitees.has(i.inviteeId)
				? [{ inviteId: i.id, invitee: identityOf(u), createdAt: i.createdAt.getTime() }]
				: [];
		});
	}
	return {
		...summary,
		isHost,
		approximate: isApproximate(shown),
		participants,
		invites,
	};
}

/**
 * The reader's marker payload: positions of the other visible members only.
 * Read-only on purpose, since every member polls it.
 */
export async function getBuddyReadProgress(
	userId: string,
	readId: string,
	now = new Date(),
): Promise<BuddyReadProgress> {
	const [read] = await db.select().from(buddyRead).where(eq(buddyRead.id, readId));
	const state = read ? await loadState(db, read, now) : null;
	if (!state?.current.some((m) => m.userId === userId)) {
		throw new SocialError("not_found");
	}
	if (state.takenDown) return { approximate: false, participants: [] };
	const visible = await visibleTo(db, userId, state.users, now);
	const shown = state.current.filter((m) => visible.has(m.userId));
	return {
		approximate: isApproximate(shown),
		participants: shown.flatMap((m) => {
			const u = state.users.get(m.userId);
			if (!u || m.userId === userId || !m.book) return [];
			return [
				{
					userId: m.userId,
					name: u.name,
					handle: u.handle ?? "",
					wordPosition: m.book.wordPosition,
					wordCount: m.book.wordCount,
					percent: percentOf(m.book),
				},
			];
		}),
	};
}

/** Pending invites between two users close when their friendship does or a block lands. */
export async function cancelInvitesBetween(tx: Tx, a: string, b: string, now: Date) {
	const cancelled = await tx
		.update(buddyReadInvite)
		.set({ status: "cancelled", resolvedAt: now })
		.where(
			and(
				eq(buddyReadInvite.status, "pending"),
				or(
					and(eq(buddyReadInvite.inviterId, a), eq(buddyReadInvite.inviteeId, b)),
					and(eq(buddyReadInvite.inviterId, b), eq(buddyReadInvite.inviteeId, a)),
				),
			),
		)
		.returning({ id: buddyReadInvite.id });
	for (const { id } of cancelled) await deleteNotificationsForSubject(tx, "buddy_read_invite", id);
}
