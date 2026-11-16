import { createFileRoute } from "@tanstack/react-router";
import CollectionBooksPage from "@/pages/library/collection-books-page";

export const Route = createFileRoute("/tabs/library/collections/$id/edit")({
	component: CollectionEditRoute,
});

function CollectionEditRoute() {
	const { id } = Route.useParams();
	return <CollectionBooksPage key={id} mode={{ kind: "edit", id }} />;
}
