import { createFileRoute } from "@tanstack/react-router";
import CollectionBooksPage from "@/pages/library/collection-books-page";

export const Route = createFileRoute("/tabs/library/collections/new")({
	validateSearch: (search: Record<string, unknown>): { series?: true } =>
		search.series === true || search.series === "true" ? { series: true } : {},
	component: NewCollectionRoute,
});

function NewCollectionRoute() {
	const { series } = Route.useSearch();
	return (
		<CollectionBooksPage
			key={series ? "series" : "collection"}
			mode={{ kind: "create", series: series === true }}
		/>
	);
}
