import { createFileRoute } from "@tanstack/react-router";
import LibraryBookDetail from "@/pages/library/book-detail";

export const Route = createFileRoute("/tabs/library/book/$id")({
	component: BookDetailRoute,
});

function BookDetailRoute() {
	const { id } = Route.useParams();
	return <LibraryBookDetail id={id} />;
}
