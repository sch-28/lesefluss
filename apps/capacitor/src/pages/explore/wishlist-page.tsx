import { Button } from "@lesefluss/ui/button";
import { useRouter } from "@tanstack/react-router";
import { Compass, Heart } from "lucide-react";
import type React from "react";
import { PageBody } from "@/components/page-body";
import { PageHeader } from "../../components/app-shell/page-header";
import { queryHooks } from "../../services/db/hooks";
import { EmptyState } from "../_shared/load-states";
import { CardGridSkeleton, EXPLORE_GRID_CLASS } from "./skeletons";
import WishlistCard from "./wishlist-card";

const ExploreWishlist: React.FC = () => {
	const router = useRouter();
	const { data: items } = queryHooks.useWishlist();
	return (
		<div className="bg-background">
			<PageHeader width="grid" title="Wishlist" icon={Heart} backTo="/tabs/explore" />
			<PageBody width="grid">
				{items === undefined ? (
					<CardGridSkeleton count={6} />
				) : items.length === 0 ? (
					<EmptyState
						icon={Heart}
						title="Nothing on your wishlist yet"
						page
						action={
							<Button variant="outline" onClick={() => router.navigate({ to: "/tabs/explore" })}>
								<Compass />
								Browse Explore
							</Button>
						}
					>
						Save a title from its page in Explore to find it here.
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
			</PageBody>
		</div>
	);
};

export default ExploreWishlist;
