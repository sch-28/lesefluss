import { Heart, HeartOff } from "lucide-react";
import { toast } from "../../components/toast";
import { queryHooks } from "../../services/db/hooks";
import type { WishlistInput } from "../../services/db/queries/wishlist";
import type { DetailAction } from "../_shared/detail-shell";

/**
 * The detail pages' wishlist toggle; null while the wishlist loads, with no title,
 * or when the title is not saved and `canAdd` is false. A saved title always offers
 * Remove: one that reached the library without this device importing it would
 * otherwise sit on the wishlist with no way off.
 */
export function useWishlistAction(
	item: WishlistInput | null,
	canAdd: boolean,
): DetailAction | null {
	const entry = queryHooks.useWishlistEntry(item?.kind ?? "catalog", item?.ref);
	const toggle = queryHooks.useToggleWishlist();
	if (!item || entry === undefined) return null;
	const saved = entry !== null;
	if (!saved && !canAdd) return null;
	return {
		label: saved ? "Remove from wishlist" : "Add to wishlist",
		icon: saved ? HeartOff : Heart,
		disabled: toggle.isPending,
		onClick: () =>
			toggle.mutate(
				{ saved: !saved, item },
				{ onError: () => toast.error("Couldn't update your wishlist") },
			),
	};
}
