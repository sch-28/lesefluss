import { PUSH_CATEGORY_TYPES, pushCategoryOf } from "@lesefluss/core";
import { sql } from "drizzle-orm";
import type { Tx } from "~/db";
import { socialPushOutbox } from "~/db/schema";
import { isPushConfigured } from "./fcm";

export const PUSH_BATCH_WINDOW_MS = 2 * 60_000;

const BATCHED_TYPES: readonly string[] = PUSH_CATEGORY_TYPES.discussion;

export type PushEvent = {
	recipientId: string;
	actorId: string | null;
	type: string;
	subjectId: string;
};

/**
 * Queues a push for an inbox event, in the caller's transaction. Replies and
 * reactions on one subject merge into the first pending row, which waits out
 * the batching window; any other repeated event is sent again right away.
 */
export async function enqueuePush(tx: Tx, event: PushEvent, now: Date): Promise<void> {
	const { actorId } = event;
	if (!actorId || !pushCategoryOf(event.type) || !isPushConfigured()) return;
	const isBatched = BATCHED_TYPES.includes(event.type);
	const dedupeKey = isBatched
		? [event.recipientId, event.type, event.subjectId].join(":")
		: [event.recipientId, event.type, actorId, event.subjectId].join(":");
	const batchedUntil = new Date(now.getTime() + PUSH_BATCH_WINDOW_MS);
	await tx
		.insert(socialPushOutbox)
		.values({
			dedupeKey,
			recipientId: event.recipientId,
			actorId,
			type: event.type,
			subjectId: event.subjectId,
			createdAt: now,
			sendAfter: isBatched ? batchedUntil : now,
		})
		.onConflictDoUpdate({
			target: socialPushOutbox.dedupeKey,
			// A batched row keeps its window; one leased mid-send is pulled back to it, so
			// the drainer's compare-and-delete misses and the newer reply still goes out.
			set: isBatched
				? {
						actorId,
						sendAfter: sql`least(${socialPushOutbox.sendAfter}, ${batchedUntil.toISOString()}::timestamp)`,
					}
				: { actorId, createdAt: now, sendAfter: now },
		});
}
