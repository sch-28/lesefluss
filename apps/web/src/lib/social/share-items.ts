import type { InboxSubject, ShareItemState } from "@lesefluss/core";
import { SHARE_TTL_DAYS } from "@lesefluss/core";
import { and, inArray, sql } from "drizzle-orm";
import type { DbExecutor } from "~/db";
import { type SocialShare, socialShare, syncBooks } from "~/db/schema";
import { activeSharingSuspension } from "~/lib/moderation/restrictions";
import { isOriginTakenDown } from "~/lib/moderation/takedown";
import { pairIn } from "~/lib/sql-helpers";
import { isShareableRow } from "./copy-book";
import { coverFor } from "./profile-view";
import { areFriends } from "./relationship";

const DAY_MS = 86_400_000;

/** Shares created before this moment have expired. */
export function shareExpiryCutoff(now: Date): Date {
	return new Date(now.getTime() - SHARE_TTL_DAYS * DAY_MS);
}

export function isShareExpired(share: Pick<SocialShare, "createdAt">, now: Date): boolean {
	return share.createdAt <= shareExpiryCutoff(now);
}

type SourceRow = { userId: string; bookId: string; catalogId: string | null; hasCover: boolean };

/**
 * The live state and book card for a page of received-share items. Every
 * reason a pending share cannot be taken collapses into `unavailable`: the
 * recipient is told nothing about the sender's suspension or a takedown.
 */
export async function shareSubjectsFor(
	exec: DbExecutor,
	viewerId: string,
	shareIds: string[],
	now: Date,
): Promise<Map<string, InboxSubject>> {
	const out = new Map<string, InboxSubject>();
	if (shareIds.length === 0) return out;
	const shares = await exec.select().from(socialShare).where(inArray(socialShare.id, shareIds));
	// Sources for every listed share: an accepted item keeps showing its cover.
	const sources = new Map<string, SourceRow>();
	if (shares.length > 0) {
		const rows = await exec
			.select({
				userId: syncBooks.userId,
				bookId: syncBooks.bookId,
				catalogId: syncBooks.catalogId,
				hasCover: sql<boolean>`${syncBooks.coverImage} IS NOT NULL`,
			})
			.from(syncBooks)
			.where(
				and(
					pairIn(
						[syncBooks.userId, syncBooks.bookId],
						shares.map((s) => [s.senderId, s.bookId]),
					),
					isShareableRow(),
				),
			);
		for (const r of rows)
			sources.set(`${r.userId}:${r.bookId}`, { ...r, hasCover: Boolean(r.hasCover) });
	}

	for (const share of shares) {
		const source = sources.get(`${share.senderId}:${share.bookId}`);
		// The cover route re-checks the friendship anyway; not handing out a URL
		// that would 404 spares the recipient a doomed request per row.
		const isFriend = source ? await areFriends(exec, viewerId, share.senderId, now) : false;
		let state: ShareItemState;
		if (share.status === "accepted") state = "accepted";
		else if (share.status === "declined") state = "declined";
		else if (share.status !== "pending" || isShareExpired(share, now) || !source) {
			state = "unavailable";
		} else {
			const [suspension, takenDown] = await Promise.all([
				activeSharingSuspension(exec, share.senderId, now),
				isOriginTakenDown(share.originUserId, share.originBookId, exec),
			]);
			state = isFriend && !suspension && !takenDown ? "pending" : "unavailable";
		}
		out.set(share.id, {
			kind: "share",
			shareId: share.id,
			state,
			book: {
				title: share.title,
				author: share.author,
				wordCount: share.wordCount,
				cover:
					source && isFriend && state !== "unavailable"
						? coverFor(viewerId, source.catalogId, source.hasCover, {
								kind: "book",
								ownerId: share.senderId,
								id: share.bookId,
							})
						: null,
			},
		});
	}
	return out;
}
