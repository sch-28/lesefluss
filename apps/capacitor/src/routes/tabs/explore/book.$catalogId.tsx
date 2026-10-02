import { createFileRoute } from "@tanstack/react-router";
import ExploreBookDetail from "@/pages/explore/book-detail";

export const Route = createFileRoute("/tabs/explore/book/$catalogId")({
	component: BookDetailRoute,
});

function BookDetailRoute() {
	const { catalogId } = Route.useParams();
	// Keyed so a jump to another book (similar, more by author) starts fresh:
	// expanded tags and description must not carry over.
	return <ExploreBookDetail key={catalogId} catalogId={catalogId} />;
}
