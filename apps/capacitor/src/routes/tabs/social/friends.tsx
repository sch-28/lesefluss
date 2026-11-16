import { createFileRoute } from "@tanstack/react-router";
import FriendsPage from "@/pages/social/friends";

export const Route = createFileRoute("/tabs/social/friends")({
	component: FriendsPage,
});
