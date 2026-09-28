import { createFileRoute } from "@tanstack/react-router";
import BlockedUsersPage from "@/pages/social/blocked";

export const Route = createFileRoute("/tabs/social/blocked")({
	component: BlockedUsersPage,
});
