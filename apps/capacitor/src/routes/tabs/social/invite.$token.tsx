import { createFileRoute } from "@tanstack/react-router";
import InvitePage from "@/pages/social/invite";

export const Route = createFileRoute("/tabs/social/invite/$token")({
	component: InviteRoute,
});

function InviteRoute() {
	const { token } = Route.useParams();
	return <InvitePage token={token} />;
}
