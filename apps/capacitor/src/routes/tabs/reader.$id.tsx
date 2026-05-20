import { createFileRoute } from "@tanstack/react-router";
import BookReader from "@/pages/reader";

export const Route = createFileRoute("/tabs/reader/$id")({
	component: ReaderRoute,
});

function ReaderRoute() {
	const { id } = Route.useParams();
	return <BookReader id={id} />;
}
