import type { WishlistKind } from "@lesefluss/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { scheduleSyncPush } from "../../sync";
import { queries } from "../queries";
import { type WishlistInput, wishlistKey } from "../queries/wishlist";
import { wishlistKeys } from "./query-keys";

function useWishlist() {
	return useQuery({ queryKey: wishlistKeys.all, queryFn: () => queries.getWishlist() });
}

/** The live item for a title, or null; undefined while the list loads. */
function useWishlistEntry(kind: WishlistKind, ref: string | null | undefined) {
	const { data } = useWishlist();
	if (!data) return undefined;
	if (!ref) return null;
	const key = wishlistKey(kind, ref);
	return data.find((item) => wishlistKey(item.kind, item.ref) === key) ?? null;
}

/** `saved: true` adds the title, `false` removes it. */
function useToggleWishlist() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async ({ saved, item }: { saved: boolean; item: WishlistInput }) => {
			if (saved) await queries.addToWishlist(item);
			else await queries.removeFromWishlist(item.kind, item.ref);
		},
		onSuccess: () => {
			scheduleSyncPush();
			return qc.invalidateQueries({ queryKey: wishlistKeys.all });
		},
	});
}

export const wishlistHooks = { useWishlist, useWishlistEntry, useToggleWishlist };
