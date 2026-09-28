import { socialHooks } from "./hooks";
import {
	createNotification,
	deleteNotificationsBetween,
	deleteNotificationsForSubject,
	markSubjectRead,
} from "./inbox";

socialHooks.onRequestCreated.push(async (tx, request) => {
	await createNotification(tx, {
		recipientId: request.addresseeId,
		actorId: request.requesterId,
		type: "friend_request_received",
		subjectId: request.id,
	});
});

// The recipient's own decision stays in their inbox as a read item; a cancel or
// block leaves nothing to show. Only an accept tells the sender anything, which
// keeps declines, cancels and blocks silent.
socialHooks.onRequestRemoved.push(async (tx, request, reason) => {
	if (reason === "cancelled" || reason === "blocked") {
		await deleteNotificationsForSubject(tx, "friend_request_received", request.id);
		return;
	}
	await markSubjectRead(tx, "friend_request_received", request.id);
	if (reason === "accepted") {
		await createNotification(tx, {
			recipientId: request.requesterId,
			actorId: request.addresseeId,
			type: "friend_request_accepted",
			subjectId: request.id,
		});
	}
});

socialHooks.onBlock.push(async (tx, blockerId, blockedId) => {
	await deleteNotificationsBetween(tx, blockerId, blockedId);
});

socialHooks.onInviteRedeemed.push(async (tx, ownerId, redeemerId) => {
	await createNotification(tx, {
		recipientId: ownerId,
		actorId: redeemerId,
		type: "friend_joined_via_invite",
		subjectId: redeemerId,
	});
});
