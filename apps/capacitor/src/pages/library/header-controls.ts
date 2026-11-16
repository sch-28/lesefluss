import type { ViewMode } from "../../components/view-mode-toggle";

export type LibraryViewMode = ViewMode | "table";

export type HeaderControls = {
	search: boolean;
	filter: boolean;
	sort: boolean;
	view: boolean;
};

/** Which of the library toolbar's view controls show. The ordered (series)
 *  view keeps its members in #N order, so only its layout can change; an empty
 *  library has nothing to search, sort or lay out. */
export function headerControls(view: {
	isOrderedView: boolean;
	isEmptyLibrary?: boolean;
}): HeaderControls {
	const listed = !view.isOrderedView && !view.isEmptyLibrary;
	return { search: listed, filter: listed, sort: listed, view: !view.isEmptyLibrary };
}
