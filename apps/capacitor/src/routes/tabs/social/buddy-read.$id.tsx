import { createFileRoute } from "@tanstack/react-router";
import BuddyReadPage from "@/pages/social/buddy-read";

export const Route = createFileRoute("/tabs/social/buddy-read/$id")({
	component: BuddyReadRoute,
});

function BuddyReadRoute() {
	const { id } = Route.useParams();
	return <BuddyReadPage id={id} />;
}
