import type { Tx } from "~/db";
import type { SocialFriendRequest } from "~/db/schema";

export type RequestRemovalReason = "accepted" | "declined" | "cancelled" | "blocked";
export type FriendshipRemovalReason = "removed" | "blocked";

/**
 * Extension points other social features register into. Every hook runs
 * inside the transaction of the write that triggered it, so a failing hook
 * rolls the write back. Account deletion removes rows by FK cascade and fires
 * none of these; features that must react to it hook into purgeUserSyncData.
 */
export const socialHooks = {
	onRequestCreated: [] as ((tx: Tx, request: SocialFriendRequest) => Promise<void>)[],
	onRequestRemoved: [] as ((
		tx: Tx,
		request: SocialFriendRequest,
		reason: RequestRemovalReason,
	) => Promise<void>)[],
	onFriendshipCreated: [] as ((tx: Tx, userLow: string, userHigh: string) => Promise<void>)[],
	onFriendshipRemoved: [] as ((
		tx: Tx,
		a: string,
		b: string,
		reason: FriendshipRemovalReason,
	) => Promise<void>)[],
	/** Fires on every new block, whether or not a friendship or request existed. */
	onBlock: [] as ((tx: Tx, blockerId: string, blockedId: string) => Promise<void>)[],
	/** Fires after an invite link created a friendship; the owner is the one who did not act. */
	onInviteRedeemed: [] as ((tx: Tx, ownerId: string, redeemerId: string) => Promise<void>)[],
};

export async function runHooks<A extends unknown[]>(
	hooks: readonly ((...args: A) => Promise<void>)[],
	...args: A
): Promise<void> {
	for (const hook of hooks) await hook(...args);
}
