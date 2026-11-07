import type { WishlistKind } from "@lesefluss/core";
import { log } from "../utils/log";
import { queries } from "./db/queries";
import { scheduleSyncPush } from "./sync";

/**
 * An imported title leaves the wishlist. `refs` lists every spelling the import
 * knows (the URL it was given and the series root it resolved to). Never fails
 * the import that calls it: the book is in the library by then.
 */
export async function clearImportedFromWishlist(
	kind: WishlistKind,
	refs: readonly string[],
): Promise<void> {
	try {
		let removed = false;
		for (const ref of new Set(refs)) {
			if (await queries.removeFromWishlist(kind, ref)) removed = true;
		}
		if (removed) scheduleSyncPush();
	} catch (err) {
		log.warn("wishlist", "clearing an imported title failed:", err);
	}
}
