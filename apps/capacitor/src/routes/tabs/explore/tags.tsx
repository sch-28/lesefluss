import { createFileRoute } from "@tanstack/react-router";
import { parseExploreSearch } from "@/pages/explore/explore-search";
import ExploreTags from "@/pages/explore/tags";

/** Carries the Explore search it was opened from, so picking a tag adds to it. */
export const Route = createFileRoute("/tabs/explore/tags")({
	component: TagsRoute,
	validateSearch: parseExploreSearch,
});

function TagsRoute() {
	return <ExploreTags from={Route.useSearch()} />;
}
