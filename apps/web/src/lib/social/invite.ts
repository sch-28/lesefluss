import { randomBytes } from "node:crypto";
import { INVITE_TTL_DAYS, type InviteInfo, type InvitePreview } from "@lesefluss/core";
import { and, eq, gt, isNull } from "drizzle-orm";
import { type DbExecutor, db } from "~/db";
import { socialInvite, socialProfile } from "~/db/schema";
import { SocialError } from "./errors";
import { createFriendship, lockUsers } from "./friends";
import { runHooks, socialHooks } from "./hooks";
import {
	friendshipExists,
	hasBlockEitherWay,
	identityOf,
	isBanned,
	isSociallyVisible,
	loadSocialUsers,
} from "./relationship";

const DAY_MS = 86_400_000;
const TOKEN_BYTES = 32;

function inviteUrl(token: string): string {
	return `${process.env.BETTER_AUTH_URL}/invite/${token}`;
}

async function hasHandle(exec: DbExecutor, userId: string): Promise<boolean> {
	const [row] = await exec
		.select({ handle: socialProfile.handle })
		.from(socialProfile)
		.where(eq(socialProfile.userId, userId));
	return Boolean(row?.handle);
}

/** Replaces any earlier link: one row per owner, so the old token stops resolving. */
export async function createInvite(ownerId: string, now = new Date()): Promise<InviteInfo> {
	if (!(await hasHandle(db, ownerId))) throw new SocialError("handle_required");
	const token = randomBytes(TOKEN_BYTES).toString("base64url");
	const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * DAY_MS);
	// Same lock as redeemInvite, so a redemption in flight sees either the old
	// or the new link, never a half-replaced one.
	await db.transaction(async (tx) => {
		await lockUsers(tx, ownerId);
		await tx
			.insert(socialInvite)
			.values({ ownerId, token, createdAt: now, expiresAt })
			.onConflictDoUpdate({
				target: socialInvite.ownerId,
				set: { token, createdAt: now, expiresAt, revokedAt: null },
			});
	});
	return { url: inviteUrl(token), expiresAt: expiresAt.getTime() };
}

export async function getCurrentInvite(
	ownerId: string,
	now = new Date(),
): Promise<InviteInfo | null> {
	const [row] = await db
		.select()
		.from(socialInvite)
		.where(
			and(
				eq(socialInvite.ownerId, ownerId),
				isNull(socialInvite.revokedAt),
				gt(socialInvite.expiresAt, now),
			),
		);
	return row ? { url: inviteUrl(row.token), expiresAt: row.expiresAt.getTime() } : null;
}

export async function revokeInvite(ownerId: string, now = new Date()): Promise<void> {
	await db.transaction(async (tx) => {
		await lockUsers(tx, ownerId);
		await tx
			.update(socialInvite)
			.set({ revokedAt: now })
			.where(and(eq(socialInvite.ownerId, ownerId), isNull(socialInvite.revokedAt)));
	});
}

/**
 * Resolves a token to what the viewer may do with it, writing nothing. Every
 * dead end that must not leak (blocked either way, banned or vanished owner,
 * expired, revoked) collapses into "invalid".
 */
export async function previewInvite(
	exec: DbExecutor,
	viewerId: string | null,
	token: string,
	now = new Date(),
): Promise<InvitePreview> {
	const [row] = await exec.select().from(socialInvite).where(eq(socialInvite.token, token));
	if (!row || row.revokedAt || row.expiresAt <= now) return { state: "invalid" };
	const users = await loadSocialUsers(exec, viewerId ? [row.ownerId, viewerId] : [row.ownerId]);
	const owner = users.get(row.ownerId);
	if (!owner || !isSociallyVisible(owner, now)) return { state: "invalid" };
	const identity = identityOf(owner);
	if (viewerId === null) return { state: "signed_out", owner: identity };
	if (viewerId === row.ownerId) return { state: "own", owner: identity };
	const viewer = users.get(viewerId);
	if (!viewer || isBanned(viewer, now)) return { state: "invalid" };
	if (await hasBlockEitherWay(exec, viewerId, row.ownerId)) return { state: "invalid" };
	if (viewer.handle === null) return { state: "handle_required", owner: identity };
	if (await friendshipExists(exec, viewerId, row.ownerId)) {
		return { state: "already_friends", owner: identity };
	}
	return { state: "valid", owner: identity };
}

/** Creates the accepted friendship for a valid link; any other state is returned unchanged. */
export async function redeemInvite(
	viewerId: string,
	token: string,
	now = new Date(),
): Promise<InvitePreview> {
	return db.transaction(async (tx) => {
		const [row] = await tx
			.select({ ownerId: socialInvite.ownerId })
			.from(socialInvite)
			.where(eq(socialInvite.token, token));
		if (row) await lockUsers(tx, viewerId, row.ownerId);
		const preview = await previewInvite(tx, viewerId, token, now);
		if (preview.state !== "valid" || !preview.owner) return preview;
		await createFriendship(tx, viewerId, preview.owner.userId, now);
		await runHooks(socialHooks.onInviteRedeemed, tx, preview.owner.userId, viewerId);
		return { state: "already_friends", owner: preview.owner };
	});
}
