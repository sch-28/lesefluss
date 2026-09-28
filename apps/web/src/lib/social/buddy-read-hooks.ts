import { cancelInvitesBetween } from "./buddy-reads";
import { socialHooks } from "./hooks";

// A pending invite needs the friendship to be taken, so its end frees the seat
// and removes the item instead of leaving a dead invite until it expires.
socialHooks.onFriendshipRemoved.push(async (tx, a, b) => {
	await cancelInvitesBetween(tx, a, b, new Date());
});

socialHooks.onBlock.push(async (tx, blockerId, blockedId) => {
	await cancelInvitesBetween(tx, blockerId, blockedId, new Date());
});
