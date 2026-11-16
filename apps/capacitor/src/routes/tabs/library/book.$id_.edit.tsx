import { createFileRoute } from "@tanstack/react-router";
import BookEditPage from "@/pages/library/book-edit-page";

export const Route = createFileRoute("/tabs/library/book/$id_/edit")({
	component: BookEditRoute,
});

function BookEditRoute() {
	const { id } = Route.useParams();
	return <BookEditPage id={id} />;
}
