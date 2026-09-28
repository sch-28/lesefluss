import { createFileRoute } from "@tanstack/react-router";
import BuddyReadsPage from "@/pages/social/buddy-reads";

export const Route = createFileRoute("/tabs/social/buddy-reads")({
	component: BuddyReadsPage,
});
