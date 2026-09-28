import { socialHooks } from "./hooks";
import { revokePendingSharesBetween } from "./shares";

// Pending offers exist only between friends, so the friendship's end (by either
// side, by unfriending or by a block) is the one moment to withdraw them.
socialHooks.onFriendshipRemoved.push(async (tx, a, b) => {
	await revokePendingSharesBetween(tx, a, b, new Date());
});
