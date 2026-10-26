import type { SyncSettingsPush } from "@lesefluss/core";
import { sql } from "drizzle-orm";
import type { DbExecutor } from "~/db";
import { syncSettings } from "~/db/schema";

/**
 * Last-write-wins upsert of a pushed settings row. Writes only the fields the
 * push carried, so a field it left out keeps its stored value (or the column
 * default on a first push).
 */
export async function upsertSyncSettings(
	exec: DbExecutor,
	userId: string,
	settings: SyncSettingsPush,
): Promise<void> {
	const fields = {
		...settings,
		// Clamped: a client clock running ahead would otherwise outrank every
		// later write under the last-write-wins guard below.
		updatedAt: new Date(Math.min(settings.updatedAt, Date.now())),
	};
	await exec
		.insert(syncSettings)
		.values({ userId, ...fields })
		.onConflictDoUpdate({
			target: [syncSettings.userId],
			set: fields,
			// A device that missed newer settings must not overwrite them with its
			// stale row on push.
			setWhere: sql`excluded.updated_at > sync_settings.updated_at`,
		});
}
