import { createFileRoute } from "@tanstack/react-router";
import SeriesDetail from "@/pages/library/series-detail";

export const Route = createFileRoute("/tabs/library/series/$id")({
	component: SeriesDetailRoute,
});

function SeriesDetailRoute() {
	const { id } = Route.useParams();
	return <SeriesDetail id={id} />;
}
