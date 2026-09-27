import { createFileRoute } from "@tanstack/react-router";
import InviteLinkPage from "@/pages/social/invite-link";

export const Route = createFileRoute("/tabs/social/invite-link")({
	component: InviteLinkPage,
});
