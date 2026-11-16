import { createFileRoute } from "@tanstack/react-router";
import AllSeriesPage from "@/pages/library/all-series-page";

export const Route = createFileRoute("/tabs/library/all-series")({
	component: AllSeriesPage,
});
