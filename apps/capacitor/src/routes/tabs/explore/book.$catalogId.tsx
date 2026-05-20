import { createFileRoute } from "@tanstack/react-router";
import ExploreBookDetail from "@/pages/explore/book-detail";

export const Route = createFileRoute("/tabs/explore/book/$catalogId")({
	component: BookDetailRoute,
});

function BookDetailRoute() {
	const { catalogId } = Route.useParams();
	return <ExploreBookDetail catalogId={catalogId} />;
}
