import { createFileRoute } from "@tanstack/react-router";
import SocialPage from "@/pages/social";

export const Route = createFileRoute("/tabs/social/")({
	component: SocialPage,
});
