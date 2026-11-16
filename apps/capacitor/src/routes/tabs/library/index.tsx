import { createFileRoute } from "@tanstack/react-router";
import Library from "@/pages/library";

/** `f` is the encoded library filter (`encodeFilterParam`), decoded by the page;
 *  `shelf` the open smart shelf's id. */
export type LibrarySearch = { collection?: string; f?: string; shelf?: string };

export const Route = createFileRoute("/tabs/library/")({
	validateSearch: (search: Record<string, unknown>): LibrarySearch => ({
		collection: typeof search.collection === "string" ? search.collection : undefined,
		f: typeof search.f === "string" ? search.f : undefined,
		shelf: typeof search.shelf === "string" ? search.shelf : undefined,
	}),
	component: Library,
});
