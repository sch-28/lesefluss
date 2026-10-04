import type { PushPlatform } from "@lesefluss/core";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "~/db";
import { socialPushToken } from "~/db/schema";

/**
 * The FCM token is the key, so a device that signs into another account moves
 * to it. A session is one device with one current token, so a rotated token
 * replaces the session's earlier ones.
 */
export async function registerPushToken(input: {
	token: string;
	platform: PushPlatform;
	userId: string;
	sessionId: string;
}): Promise<void> {
	const now = new Date();
	await db.transaction(async (tx) => {
		// Two registrations of one session at once would each miss the other's insert.
		await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.sessionId}))`);
		await tx
			.delete(socialPushToken)
			.where(
				and(eq(socialPushToken.sessionId, input.sessionId), ne(socialPushToken.token, input.token)),
			);
		await tx
			.insert(socialPushToken)
			.values({ ...input, createdAt: now, updatedAt: now })
			.onConflictDoUpdate({
				target: socialPushToken.token,
				set: {
					platform: input.platform,
					userId: input.userId,
					sessionId: input.sessionId,
					updatedAt: now,
				},
			});
	});
}
