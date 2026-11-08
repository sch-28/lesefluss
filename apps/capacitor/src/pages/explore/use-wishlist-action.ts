import { Heart, HeartOff } from "lucide-react";
import { toast } from "../../components/toast";
import { queryHooks } from "../../services/db/hooks";
import type { WishlistInput } from "../../services/db/queries/wishlist";
import type { DetailAction } from "../_shared/detail-shell";

const WISHLIST_ERROR = "Couldn't update your wishlist";

/**
 * Removes a title and offers Undo, which saves it again. The removing card is
 * gone by then, so Undo runs on the mutation, not on per-call callbacks.
 */
export function useRemoveFromWishlist() {
	const toggle = queryHooks.useToggleWishlist();
	const remove = (item: WishlistInput) =>
		toggle.mutate(
			{ saved: false, item },
			{
				onSuccess: () =>
					toast.success(`Removed ${item.title} from your wishlist`, {
						action: { label: "Undo", onClick: () => toggle.mutate({ saved: true, item }) },
					}),
				onError: () => toast.error(WISHLIST_ERROR),
			},
		);
	return { remove, isPending: toggle.isPending };
}

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
	const removal = useRemoveFromWishlist();
	if (!item || entry === undefined) return null;
	const saved = entry !== null;
	if (!saved && !canAdd) return null;
	return {
		label: saved ? "Remove from wishlist" : "Add to wishlist",
		icon: saved ? HeartOff : Heart,
		disabled: toggle.isPending || removal.isPending,
		onClick: () =>
			saved
				? removal.remove(item)
				: toggle.mutate({ saved: true, item }, { onError: () => toast.error(WISHLIST_ERROR) }),
	};
}
