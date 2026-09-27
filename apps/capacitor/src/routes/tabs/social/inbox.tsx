import { createFileRoute } from "@tanstack/react-router";
import InboxPage from "@/pages/social/inbox";

export const Route = createFileRoute("/tabs/social/inbox")({
	component: InboxPage,
});
