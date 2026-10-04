import {
	DEFAULT_PUSH_PREFERENCES,
	type PushPreferences,
	type PushPreferencesPatch,
} from "@lesefluss/core";
import { eq } from "drizzle-orm";
import { type DbExecutor, db } from "~/db";
import { socialPushPreferences } from "~/db/schema";

export async function loadPushPreferences(
	exec: DbExecutor,
	userId: string,
): Promise<PushPreferences> {
	const [row] = await exec
		.select()
		.from(socialPushPreferences)
		.where(eq(socialPushPreferences.userId, userId));
	if (!row) return DEFAULT_PUSH_PREFERENCES;
	return {
		friend_requests: row.friendRequests,
		shares: row.shares,
		buddy_reads: row.buddyReads,
		discussion: row.discussion,
		previews: row.previews,
	};
}

const COLUMN_OF = {
	friend_requests: "friendRequests",
	shares: "shares",
	buddy_reads: "buddyReads",
	discussion: "discussion",
	previews: "previews",
} as const satisfies Record<keyof PushPreferences, keyof typeof socialPushPreferences.$inferInsert>;

export async function updatePushPreferences(
	userId: string,
	patch: PushPreferencesPatch,
): Promise<PushPreferences> {
	const changes: Partial<typeof socialPushPreferences.$inferInsert> = { updatedAt: new Date() };
	for (const [key, value] of Object.entries(patch) as [keyof PushPreferences, boolean][]) {
		changes[COLUMN_OF[key]] = value;
	}
	await db
		.insert(socialPushPreferences)
		.values({ userId, ...changes })
		.onConflictDoUpdate({ target: socialPushPreferences.userId, set: changes });
	return loadPushPreferences(db, userId);
}
