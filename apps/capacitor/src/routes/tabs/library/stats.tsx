import { createFileRoute } from "@tanstack/react-router";
import { parseStatsSearch, redirectToStatsTab } from "@/pages/library/stats/stats-search";

export const Route = createFileRoute("/tabs/library/stats")({
	validateSearch: parseStatsSearch,
	beforeLoad: redirectToStatsTab,
});
