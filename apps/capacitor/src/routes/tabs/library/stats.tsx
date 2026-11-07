import { createFileRoute } from "@tanstack/react-router";
import Stats from "@/pages/library/stats";
import { parseStatsSearch } from "@/pages/library/stats/stats-search";

export const Route = createFileRoute("/tabs/library/stats")({
	validateSearch: parseStatsSearch,
	component: Stats,
});
