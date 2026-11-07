import { SMART_SHELVES_PUSH_MAX, type SyncSmartShelf, SyncSmartShelfSchema } from "@lesefluss/core";
import type { SmartShelf } from "../db/schema";

export function smartShelfToSync(s: SmartShelf): SyncSmartShelf {
	return {
		shelfId: s.id,
		name: s.name,
		conditions: s.conditions,
		pinned: s.pinned,
		sortOrder: s.sortOrder,
		view: s.view,
		deleted: s.deleted,
		createdAt: s.createdAt,
		updatedAt: s.updatedAt,
	};
}

/**
 * Newest-wins per shelf, tombstones kept: the server rows that beat the local copy.
 * A server older than shelf views omits `view`; the local view is kept.
 */
export function buildSmartShelfMerge(
	local: SmartShelf[],
	server: unknown[],
): { shelves: SmartShelf[]; rejected: number } {
	let rejected = 0;
	const localShelves = new Map(local.map((s) => [s.id, s]));
	const shelves: SmartShelf[] = [];
	for (const raw of server) {
		const parsed = SyncSmartShelfSchema.safeParse(raw);
		if (!parsed.success) {
			rejected++;
			continue;
		}
		const s = parsed.data;
		const mine = localShelves.get(s.shelfId);
		if (mine !== undefined && s.updatedAt <= mine.updatedAt) continue;
		shelves.push({
			id: s.shelfId,
			name: s.name,
			conditions: s.conditions,
			pinned: s.pinned,
			sortOrder: s.sortOrder,
			view: s.view !== undefined ? s.view : (mine?.view ?? null),
			deleted: s.deleted,
			createdAt: s.createdAt,
			updatedAt: s.updatedAt,
		});
	}
	return { shelves, rejected };
}

/** Same reasoning as `pushableCollections`: one bad row would 400 the whole push. */
export function pushableSmartShelves(local: SmartShelf[]) {
	const valid = local
		.map(smartShelfToSync)
		.filter((row) => SyncSmartShelfSchema.safeParse(row).success);
	const shelves =
		valid.length > SMART_SHELVES_PUSH_MAX
			? [...valid].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, SMART_SHELVES_PUSH_MAX)
			: valid;
	return { shelves, rejected: local.length - valid.length };
}
