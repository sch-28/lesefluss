import type { ViewMode } from "../../components/view-mode-toggle";

export type LibraryViewMode = ViewMode | "table";

export type HeaderControls = {
	search: boolean;
	filter: boolean;
	sort: boolean;
	view: boolean;
};

/** Which of the library header's view controls show. The ordered (series)
 *  view lists its members in #N order on its own, and an empty library has
 *  nothing to search or sort, so none of them act there. */
export function headerControls(view: {
	isOrderedView: boolean;
	isDesktop: boolean;
	isEmptyLibrary?: boolean;
}): HeaderControls {
	const listed = !view.isOrderedView && !view.isEmptyLibrary;
	return {
		search: listed,
		filter: listed && !view.isDesktop,
		sort: listed,
		view: listed,
	};
}
