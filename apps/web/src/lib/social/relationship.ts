import type { SocialIdentity } from "@lesefluss/core";
import { and, eq, inArray, or } from "drizzle-orm";
import type { DbExecutor } from "~/db";
import { user } from "~/db/auth-schema";
import { socialAvatar, socialBlock, socialFriendship, socialProfile } from "~/db/schema";
import { avatarUrlFor } from "./profile";

export type SocialUser = {
	id: string;
	name: string;
	handle: string | null;
	avatarId: string | null;
	banned: boolean | null;
	banExpires: Date | null;
};

export function isBanned(u: Pick<SocialUser, "banned" | "banExpires">, now = new Date()): boolean {
	return Boolean(u.banned) && (u.banExpires === null || u.banExpires > now);
}

/** A user other people may see at all: has a handle and is not banned. */
export function isSociallyVisible(u: SocialUser, now = new Date()): boolean {
	return u.handle !== null && !isBanned(u, now);
}

export async function loadSocialUsers(
	exec: DbExecutor,
	ids: readonly string[],
): Promise<Map<string, SocialUser>> {
	if (ids.length === 0) return new Map();
	const rows = await exec
		.select({
			id: user.id,
			name: user.name,
			banned: user.banned,
			banExpires: user.banExpires,
			handle: socialProfile.handle,
			avatarId: socialAvatar.id,
		})
		.from(user)
		.leftJoin(socialProfile, eq(socialProfile.userId, user.id))
		.leftJoin(socialAvatar, eq(socialAvatar.userId, user.id))
		.where(inArray(user.id, [...ids]));
	return new Map(
		rows.map((r) => [r.id, { ...r, handle: r.handle ?? null, avatarId: r.avatarId ?? null }]),
	);
}

/** Requires a visible user; callers filter with `isSociallyVisible` first. */
export function identityOf(u: SocialUser): SocialIdentity {
	return {
		userId: u.id,
		handle: u.handle ?? "",
		name: u.name,
		avatarUrl: avatarUrlFor(u.avatarId),
	};
}

export function orderedPair(a: string, b: string): [string, string] {
	return a < b ? [a, b] : [b, a];
}

export async function hasBlockEitherWay(exec: DbExecutor, a: string, b: string): Promise<boolean> {
	const rows = await exec
		.select({ blockerId: socialBlock.blockerId })
		.from(socialBlock)
		.where(
			or(
				and(eq(socialBlock.blockerId, a), eq(socialBlock.blockedId, b)),
				and(eq(socialBlock.blockerId, b), eq(socialBlock.blockedId, a)),
			),
		)
		.limit(1);
	return rows.length > 0;
}

/**
 * The gate every social read of another person passes: two distinct, existing,
 * visible users with no block in either direction. Buddy-read members use this
 * alone; friend-scoped features use `areFriends`.
 */
export async function canInteract(
	exec: DbExecutor,
	a: string,
	b: string,
	now = new Date(),
): Promise<boolean> {
	if (a === b) return false;
	const users = await loadSocialUsers(exec, [a, b]);
	const ua = users.get(a);
	const ub = users.get(b);
	if (!ua || !ub || !isSociallyVisible(ua, now) || !isSociallyVisible(ub, now)) return false;
	return !(await hasBlockEitherWay(exec, a, b));
}

export async function friendshipExists(exec: DbExecutor, a: string, b: string): Promise<boolean> {
	const [low, high] = orderedPair(a, b);
	const rows = await exec
		.select({ userLow: socialFriendship.userLow })
		.from(socialFriendship)
		.where(and(eq(socialFriendship.userLow, low), eq(socialFriendship.userHigh, high)))
		.limit(1);
	return rows.length > 0;
}

export async function areFriends(
	exec: DbExecutor,
	a: string,
	b: string,
	now = new Date(),
): Promise<boolean> {
	return (await canInteract(exec, a, b, now)) && (await friendshipExists(exec, a, b));
}
