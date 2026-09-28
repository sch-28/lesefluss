import { createFileRoute } from "@tanstack/react-router";
import ProfilePage from "@/pages/social/profile";

export const Route = createFileRoute("/tabs/social/profile/$userId")({
	validateSearch: (search: Record<string, unknown>): { as?: "friend" } =>
		search.as === "friend" ? { as: "friend" } : {},
	component: ProfileRoute,
});

function ProfileRoute() {
	const { userId } = Route.useParams();
	const { as } = Route.useSearch();
	return <ProfilePage userId={userId} isPreview={as === "friend"} />;
}
