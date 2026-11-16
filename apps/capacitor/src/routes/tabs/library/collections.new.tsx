import { createFileRoute } from "@tanstack/react-router";
import CollectionBooksPage from "@/pages/library/collection-books-page";

export const Route = createFileRoute("/tabs/library/collections/new")({
	component: () => <CollectionBooksPage mode={{ kind: "create" }} />,
});
