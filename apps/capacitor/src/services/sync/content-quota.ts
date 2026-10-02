import { Preferences } from "@capacitor/preferences";
import {
	CONTENT_QUOTA_EXCEEDED,
	type ContentQuota,
	type ContentQuotaExceeded,
} from "@lesefluss/core";
import { log } from "../../utils/log";

/**
 * Books whose content the server refused because the account's storage quota is
 * full, and how much room was left when it did. Their content is not offered
 * again until a pull shows more room, so a full account does not re-upload the
 * same megabytes on every push; positions and everything else keep syncing.
 */
type QuotaBlock = { bookIds: string[]; freeBytes: number };

const KEY = "sync_content_quota_block";

let cache: QuotaBlock | null = null;

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

export async function getQuotaBlock(): Promise<QuotaBlock | null> {
	if (cache) return cache;
	const { value } = await Preferences.get({ key: KEY });
	if (!value) return null;
	try {
		const parsed = JSON.parse(value) as Partial<QuotaBlock>;
		if (Array.isArray(parsed.bookIds) && typeof parsed.freeBytes === "number") {
			cache = {
				bookIds: parsed.bookIds.filter((id) => typeof id === "string"),
				freeBytes: parsed.freeBytes,
			};
			return cache;
		}
	} catch {}
	// Unreadable: forgetting it costs one refused upload, keeping it could block sync.
	await clearQuotaBlock();
	return null;
}

export async function recordQuotaRejection(rejection: ContentQuotaExceeded): Promise<void> {
	const previous = await getQuotaBlock();
	const bookIds = new Set([...(previous?.bookIds ?? []), ...rejection.rejectedContentBookIds]);
	cache = {
		bookIds: [...bookIds],
		freeBytes: Math.max(0, rejection.quotaBytes - rejection.usedBytes),
	};
	await Preferences.set({ key: KEY, value: JSON.stringify(cache) });
	log.warn(
		"sync",
		`cloud storage full (${rejection.usedBytes}/${rejection.quotaBytes} bytes): ${rejection.rejectedContentBookIds.length} book(s) stay on this device only`,
	);
}

/** Room freed (a delete, a raised quota) means the blocked books may fit now. */
export function quotaHasMoreRoom(block: QuotaBlock, quota: ContentQuota): boolean {
	return quota.quotaBytes - quota.usedBytes > block.freeBytes;
}

export async function reconcileQuotaBlock(quota: ContentQuota | undefined): Promise<void> {
	if (!quota) return;
	const block = await getQuotaBlock();
	if (block && quotaHasMoreRoom(block, quota)) await clearQuotaBlock();
}

export async function clearQuotaBlock(): Promise<void> {
	cache = null;
	await Preferences.remove({ key: KEY });
}
