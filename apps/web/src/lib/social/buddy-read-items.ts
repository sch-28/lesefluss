import type { BuddyReadInviteItemState, InboxSubject } from "@lesefluss/core";
import { eq, inArray } from "drizzle-orm";
import type { DbExecutor } from "~/db";
import { buddyRead, buddyReadInvite } from "~/db/schema";
import { isInviteVoid, loadState, type ReadState } from "./buddy-reads";
import { hasBlockEitherWay, identityOf, isSociallyVisible } from "./relationship";

/**
 * The live state and card for a page of buddy-read invite items. Every reason
 * an invite cannot be taken collapses into `unavailable`.
 */
export async function buddyReadInviteSubjectsFor(
	exec: DbExecutor,
	viewerId: string,
	inviteIds: string[],
	now: Date,
): Promise<Map<string, InboxSubject>> {
	const out = new Map<string, InboxSubject>();
	if (inviteIds.length === 0) return out;
	const invites = await exec
		.select()
		.from(buddyReadInvite)
		.where(inArray(buddyReadInvite.id, inviteIds));
	const states = new Map<string, ReadState>();
	for (const invite of invites) {
		if (states.has(invite.buddyReadId)) continue;
		const [read] = await exec.select().from(buddyRead).where(eq(buddyRead.id, invite.buddyReadId));
		if (read) states.set(read.id, await loadState(exec, read, now));
	}
	for (const invite of invites) {
		const state = states.get(invite.buddyReadId);
		if (!state) continue;
		let itemState: BuddyReadInviteItemState;
		if (invite.status === "accepted") itemState = "accepted";
		else if (invite.status === "declined") itemState = "declined";
		else itemState = (await isInviteVoid(exec, invite, state, now)) ? "unavailable" : "pending";
		const shown = [];
		let viewerIdentity = null;
		for (const m of state.current) {
			const u = state.users.get(m.userId);
			if (u && m.userId === viewerId) viewerIdentity = identityOf(u);
			if (!u || !isSociallyVisible(u, now) || m.userId === viewerId) continue;
			if (await hasBlockEitherWay(exec, viewerId, m.userId)) continue;
			shown.push({ id: m.userId, identity: identityOf(u) });
		}
		out.set(invite.id, {
			kind: "buddy_read_invite",
			inviteId: invite.id,
			buddyReadId: invite.buddyReadId,
			state: itemState,
			book: { title: state.read.title, author: state.read.author },
			// An accepted invitee can have become the host since.
			host:
				state.hostId === viewerId
					? viewerIdentity
					: (shown.find((p) => p.id === state.hostId)?.identity ?? null),
			participants: shown.map((p) => p.identity),
		});
	}
	return out;
}
