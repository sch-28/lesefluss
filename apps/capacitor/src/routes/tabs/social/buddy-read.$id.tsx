import { createFileRoute } from "@tanstack/react-router";
import BuddyReadPage, { type BuddyReadTab } from "@/pages/social/buddy-read";

export const Route = createFileRoute("/tabs/social/buddy-read/$id")({
	validateSearch: (search: Record<string, unknown>): { tab?: BuddyReadTab } =>
		search.tab === "discussion" ? { tab: "discussion" } : {},
	component: BuddyReadRoute,
});

function BuddyReadRoute() {
	const { id } = Route.useParams();
	const { tab } = Route.useSearch();
	return <BuddyReadPage id={id} tab={tab ?? "overview"} />;
}
