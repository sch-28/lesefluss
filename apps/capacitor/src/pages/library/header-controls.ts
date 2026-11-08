import type { ViewMode } from "../../components/view-mode-toggle";

export type LibraryViewMode = ViewMode | "table";

export type HeaderControls = {
	search: boolean;
	filter: boolean;
	sort: boolean;
	view: boolean;
};

/** Which of the library header's view controls show. The ordered (series)
 *  view lists its members in #N order on its own, so none of them act there. */
export function headerControls(view: {
	isOrderedView: boolean;
	isDesktop: boolean;
}): HeaderControls {
	const listed = !view.isOrderedView;
	return {
		search: listed,
		filter: listed && !view.isDesktop,
		sort: listed,
		view: listed,
	};
}
