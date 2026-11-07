import { createFileRoute } from "@tanstack/react-router";
import ExploreWishlist from "@/pages/explore/wishlist-page";

export const Route = createFileRoute("/tabs/explore/wishlist")({
	component: ExploreWishlist,
});
