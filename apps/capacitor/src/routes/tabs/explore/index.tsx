import { createFileRoute } from "@tanstack/react-router";
import Explore from "@/pages/explore";
import { parseExploreSearch } from "@/pages/explore/explore-search";

export const Route = createFileRoute("/tabs/explore/")({
	component: ExploreRoute,
	validateSearch: parseExploreSearch,
});

function ExploreRoute() {
	return <Explore search={Route.useSearch()} />;
}
