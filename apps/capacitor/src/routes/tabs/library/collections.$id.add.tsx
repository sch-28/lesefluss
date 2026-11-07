import { createFileRoute } from "@tanstack/react-router";
import CollectionBooksPage from "@/pages/library/collection-books-page";

export const Route = createFileRoute("/tabs/library/collections/$id/add")({
	component: CollectionAddRoute,
});

function CollectionAddRoute() {
	const { id } = Route.useParams();
	return <CollectionBooksPage key={id} mode={{ kind: "add", id }} />;
}
