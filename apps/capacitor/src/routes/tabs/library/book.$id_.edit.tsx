import { createFileRoute } from "@tanstack/react-router";
import BookEditPage from "@/pages/library/book-edit-page";

export type BookEditSearch = { from?: "detail" };

export const Route = createFileRoute("/tabs/library/book/$id_/edit")({
	validateSearch: (search: Record<string, unknown>): BookEditSearch => ({
		from: search.from === "detail" ? "detail" : undefined,
	}),
	component: BookEditRoute,
});

function BookEditRoute() {
	const { id } = Route.useParams();
	const { from } = Route.useSearch();
	return <BookEditPage id={id} fromDetail={from === "detail"} />;
}
