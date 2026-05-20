import { createFileRoute } from "@tanstack/react-router";
import Stats from "@/pages/library/stats";

export const Route = createFileRoute("/tabs/library/stats")({
	component: Stats,
});
