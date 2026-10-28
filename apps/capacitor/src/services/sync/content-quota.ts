import { Preferences } from "@capacitor/preferences";
import {
	CONTENT_QUOTA_EXCEEDED,
	type ContentQuota,
	type ContentQuotaExceeded,
} from "@lesefluss/core";
import { log } from "../../utils/log";

/**
 * Books whose content the server refused because the account's storage quota is
 * full, each with the bytes it would add (null when the server did not say), and
 * how much room was left at the last look. A book's content is not offered again
 * until a pull shows room for it, so a full account does not re-upload the same
 * megabytes on every push; positions and everything else keep syncing.
 */
export type QuotaBlock = { books: Record<string, number | null>; freeBytes: number };

const BLOCK_KEY = "sync_content_quota_block";
const QUOTA_KEY = "sync_content_quota";
/** Books the user was already told about; outlives a block entry so a re-refusal stays quiet. */
const REPORTED_KEY = "sync_content_quota_reported";

export function isContentQuotaExceeded(body: unknown): body is ContentQuotaExceeded {
	return (
		typeof body === "object" &&
		body !== null &&
		(body as { code?: unknown }).code === CONTENT_QUOTA_EXCEEDED &&
		Array.isArray((body as { rejectedContentBookIds?: unknown }).rejectedContentBookIds) &&
		typeof (body as { usedBytes?: unknown }).usedBytes === "number" &&
		typeof (body as { quotaBytes?: unknown }).quotaBytes === "number"
	);
}

const isSize = (value: unknown): value is number =>
	typeof value === "number" && Number.isFinite(value) && value >= 0;

/** Reads the stored block, including the `{ bookIds }` shape older builds wrote before sizes existed. */
function parseBlock(value: string): QuotaBlock | null {
	const parsed = JSON.parse(value) as {
		books?: unknown;
		bookIds?: unknown;
		freeBytes?: unknown;
	};
	if (typeof parsed.freeBytes !== "number") return null;
	const books: Record<string, number | null> = {};
	if (parsed.books && typeof parsed.books === "object") {
		for (const [id, size] of Object.entries(parsed.books)) books[id] = isSize(size) ? size : null;
	} else if (Array.isArray(parsed.bookIds)) {
		for (const id of parsed.bookIds) if (typeof id === "string") books[id] = null;
	} else {
		return null;
	}
	return { books, freeBytes: parsed.freeBytes };
}

/** Read from storage every time: in the web build another tab may have written it. */
export async function getQuotaBlock(): Promise<QuotaBlock | null> {
	const { value } = await Preferences.get({ key: BLOCK_KEY });
	if (!value) return null;
	try {
		const block = parseBlock(value);
		if (block) return block;
	} catch {}
	// Unreadable: forgetting it costs one refused upload, keeping it could block sync.
	await clearQuotaBlock();
	return null;
}

async function saveBlock(block: QuotaBlock | null): Promise<void> {
	if (!block || Object.keys(block.books).length === 0) {
		await Preferences.remove({ key: BLOCK_KEY });
		return;
	}
	await Preferences.set({ key: BLOCK_KEY, value: JSON.stringify(block) });
}

async function getReported(): Promise<Set<string>> {
	const { value } = await Preferences.get({ key: REPORTED_KEY });
	try {
		const parsed: unknown = value ? JSON.parse(value) : [];
		if (Array.isArray(parsed)) return new Set(parsed.filter((id) => typeof id === "string"));
	} catch {}
	return new Set();
}

async function saveReported(ids: ReadonlySet<string>): Promise<void> {
	if (ids.size === 0) await Preferences.remove({ key: REPORTED_KEY });
	else await Preferences.set({ key: REPORTED_KEY, value: JSON.stringify([...ids]) });
}

/** Records a refusal and returns the ids the user has not been told about yet. */
export async function recordQuotaRejection(rejection: ContentQuotaExceeded): Promise<string[]> {
	const previous = (await getQuotaBlock())?.books ?? {};
	const reported = await getReported();
	const books = { ...previous };
	const unreported: string[] = [];
	for (const id of rejection.rejectedContentBookIds) {
		if (!reported.has(id)) unreported.push(id);
		reported.add(id);
		const size = rejection.rejectedContentBytes?.[id];
		books[id] = isSize(size) ? size : (previous[id] ?? null);
	}
	await saveBlock({ books, freeBytes: Math.max(0, rejection.quotaBytes - rejection.usedBytes) });
	await saveReported(reported);
	await saveContentQuota({ usedBytes: rejection.usedBytes, quotaBytes: rejection.quotaBytes });
	log.warn(
		"sync",
		`cloud storage full (${rejection.usedBytes}/${rejection.quotaBytes} bytes): ${rejection.rejectedContentBookIds.length} book(s) stay on this device only`,
	);
	return unreported;
}

/** A book that uploaded, or left the library, may be reported again should it ever be refused. */
export async function forgetReported(ids: Iterable<string>): Promise<void> {
	const reported = await getReported();
	let changed = false;
	for (const id of ids) changed = reported.delete(id) || changed;
	if (changed) await saveReported(reported);
}

async function pruneReported(
	serverContentIds: ReadonlySet<string>,
	liveBookIds: ReadonlySet<string>,
): Promise<void> {
	const reported = await getReported();
	const kept = new Set(
		[...reported].filter((id) => !serverContentIds.has(id) && liveBookIds.has(id)),
	);
	if (kept.size !== reported.size) await saveReported(kept);
}

/**
 * The block once a pull reports `quota`. A book leaves it when the server now
 * holds its content, when it is no longer in the library, or when the free space
 * covers its size. Sized books are let through smallest first, each taking its
 * share of the room, so freeing a few megabytes re-offers what fits rather than
 * everything. A book of unknown size (refused by an older server) is let through
 * on any growth in free space, as before sizes existed.
 */
export function blockAfterPull(
	block: QuotaBlock,
	quota: ContentQuota,
	serverContentIds: ReadonlySet<string>,
	liveBookIds: ReadonlySet<string>,
): QuotaBlock | null {
	const freeBytes = Math.max(0, quota.quotaBytes - quota.usedBytes);
	const grew = freeBytes > block.freeBytes;
	const sized: [string, number][] = [];
	const books: Record<string, number | null> = {};
	for (const [id, size] of Object.entries(block.books)) {
		if (serverContentIds.has(id) || !liveBookIds.has(id)) continue;
		if (size === null) {
			if (!grew) books[id] = null;
		} else {
			sized.push([id, size]);
		}
	}
	let room = freeBytes;
	for (const [id, size] of sized.sort((a, b) => a[1] - b[1])) {
		if (size <= room) room -= size;
		else books[id] = size;
	}
	if (Object.keys(books).length === 0) return null;
	// Unknown sizes are judged by growth since the refusal; a dip in between must
	// not lower the mark, or the next small delete would re-offer them all.
	const waitingOnGrowth = Object.values(books).some((size) => size === null);
	return { books, freeBytes: waitingOnGrowth ? Math.max(block.freeBytes, freeBytes) : freeBytes };
}

export async function reconcileQuotaBlock(
	quota: ContentQuota | undefined,
	serverContentIds: ReadonlySet<string>,
	liveBookIds: ReadonlySet<string>,
): Promise<void> {
	if (!quota) return;
	await saveContentQuota(quota);
	await pruneReported(serverContentIds, liveBookIds);
	const block = await getQuotaBlock();
	if (block) await saveBlock(blockAfterPull(block, quota, serverContentIds, liveBookIds));
}

export async function clearQuotaBlock(): Promise<void> {
	await Preferences.remove({ key: BLOCK_KEY });
	await Preferences.remove({ key: REPORTED_KEY });
}

async function saveContentQuota(quota: ContentQuota): Promise<void> {
	await Preferences.set({ key: QUOTA_KEY, value: JSON.stringify(quota) });
}

/** The account's cloud storage as last reported by the server; null before any report. */
export async function getContentQuota(): Promise<ContentQuota | null> {
	const { value } = await Preferences.get({ key: QUOTA_KEY });
	if (!value) return null;
	try {
		const parsed = JSON.parse(value) as Partial<ContentQuota>;
		if (isSize(parsed.usedBytes) && isSize(parsed.quotaBytes) && parsed.quotaBytes > 0) {
			return { usedBytes: parsed.usedBytes, quotaBytes: parsed.quotaBytes };
		}
	} catch {}
	return null;
}

export async function clearContentQuota(): Promise<void> {
	await Preferences.remove({ key: QUOTA_KEY });
}
