import { Heart } from "lucide-react";
import type React from "react";
import { PageHeader } from "../../components/app-shell/page-header";
import { queryHooks } from "../../services/db/hooks";
import { EmptyState } from "../_shared/load-states";
import { CardGridSkeleton, EXPLORE_GRID_CLASS } from "./skeletons";
import WishlistCard from "./wishlist-card";

const ExploreWishlist: React.FC = () => {
	const { data: items } = queryHooks.useWishlist();
	return (
		<div className="bg-background">
			<PageHeader title="Wishlist" icon={Heart} backTo="/tabs/explore" />
			<div className="mx-auto max-w-5xl px-4 pt-4 pb-20">
				{items === undefined ? (
					<CardGridSkeleton count={6} />
				) : items.length === 0 ? (
					<EmptyState>
						Nothing on your wishlist yet. Save a title from its page in Explore to find it here.
					</EmptyState>
				) : (
					<ul className={`m-0 list-none p-0 ${EXPLORE_GRID_CLASS}`}>
						{items.map((item) => (
							<li key={item.id}>
								<WishlistCard item={item} />
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
};

export default ExploreWishlist;
