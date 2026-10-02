import { createFileRoute } from "@tanstack/react-router";
import WebNovels, { type WebNovelsSearch } from "@/pages/explore/web-novels";
import type { PopularWindow, SeriesStatus } from "@/services/serial-scrapers";

const STATUSES: readonly SeriesStatus[] = ["ongoing", "completed"];
const WINDOWS: readonly PopularWindow[] = ["week", "trending", "all-time"];

export const Route = createFileRoute("/tabs/explore/web-novels")({
	component: WebNovelsRoute,
	validateSearch: (search: Record<string, unknown>): WebNovelsSearch => ({
		provider: typeof search.provider === "string" ? search.provider : undefined,
		q: typeof search.q === "string" && search.q.trim() ? search.q : undefined,
		status: STATUSES.find((s) => s === search.status),
		window: WINDOWS.find((w) => w === search.window),
	}),
});

function WebNovelsRoute() {
	return <WebNovels search={Route.useSearch()} />;
}
