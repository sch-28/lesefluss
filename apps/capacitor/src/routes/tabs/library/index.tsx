import { createFileRoute } from "@tanstack/react-router";
import Library from "@/pages/library";

export type LibrarySearch = { collection?: string };

export const Route = createFileRoute("/tabs/library/")({
	validateSearch: (search: Record<string, unknown>): LibrarySearch => ({
		collection: typeof search.collection === "string" ? search.collection : undefined,
	}),
	component: Library,
});
