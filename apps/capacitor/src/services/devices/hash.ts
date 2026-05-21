/**
 * Deterministic FNV-1a hash matching the rsvpnano firmware's
 * `RsvpDataStore::hashBookPath` (apps/rsvpnano/src/storage/RsvpDataStore.cpp).
 *
 * The hash is computed over the UTF-8 bytes of the absolute SD path and
 * rendered as 8-char lowercase hex. The app uses the convention
 * `/books/books/<bookId>.rsvp` or `/books/articles/<bookId>.rsvp` so the
 * device-side hash for an uploaded lesefluss book is reproducible client-side
 * without a round-trip.
 */

const TEXT_ENCODER = new TextEncoder();

export type DeviceCategory = "book" | "article";

function fnv1a8(input: string): string {
	const bytes = TEXT_ENCODER.encode(input);
	let hash = 2_166_136_261;
	for (let i = 0; i < bytes.length; i++) {
		hash ^= bytes[i];
		hash = Math.imul(hash, 16_777_619);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

export function onDevicePath(bookId: string, category: DeviceCategory): string {
	const dir = category === "article" ? "/books/articles" : "/books/books";
	return `${dir}/${bookId}.rsvp`;
}

export function computeOnDeviceHash(bookId: string, category: DeviceCategory): string {
	return fnv1a8(onDevicePath(bookId, category));
}
