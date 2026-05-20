import { createFileRoute } from "@tanstack/react-router";
import ExploreBookDetail from "@/pages/explore/book-detail";

// Renders the legacy Ionic detail page. Deferred to the detail-pages phase
// alongside DetailShell rewrite. tanstack provides catalogId via prop because
// react-router-dom useParams returns empty without a matching <Route>.
export const Route = createFileRoute("/tabs/explore/book/$catalogId")({
	component: BookDetailRoute,
});

function BookDetailRoute() {
	const { catalogId } = Route.useParams();
	return <ExploreBookDetail catalogId={catalogId} />;
}
