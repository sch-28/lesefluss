import { useRouter } from "@tanstack/react-router";
import type React from "react";
import { queryHooks } from "../../services/db/hooks";
import ShelfFrame, { SHELF_ITEM_STYLE } from "./shelf-frame";
import WishlistCard from "./wishlist-card";

const SHELF_MAX = 12;

/** The Explore landing's wishlist strip; hidden while the wishlist is empty. */
const WishlistShelf: React.FC = () => {
	const router = useRouter();
	const { data: items } = queryHooks.useWishlist();
	if (!items?.length) return null;
	return (
		<ShelfFrame
			title="Wishlist"
			onSeeAll={() => router.navigate({ to: "/tabs/explore/wishlist" })}
			testId="wishlist-shelf"
		>
			{items.slice(0, SHELF_MAX).map((item) => (
				<li key={item.id} style={SHELF_ITEM_STYLE}>
					<WishlistCard item={item} />
				</li>
			))}
		</ShelfFrame>
	);
};

export default WishlistShelf;
