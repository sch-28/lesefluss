import { createFileRoute } from "@tanstack/react-router";
import NewShelfPage from "@/pages/library/new-shelf-page";

/** `f` seeds the conditions from a library filter (`encodeFilterParam`). */
export const Route = createFileRoute("/tabs/library/shelves/new")({
	validateSearch: (search: Record<string, unknown>): { f?: string } =>
		typeof search.f === "string" ? { f: search.f } : {},
	component: NewShelfRoute,
});

function NewShelfRoute() {
	const { f } = Route.useSearch();
	return <NewShelfPage key={f ?? ""} filterParam={f} />;
}
