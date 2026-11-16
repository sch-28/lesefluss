import type { ViewMode } from "../../components/view-mode-toggle";

export type LibraryViewMode = ViewMode | "table";

export type HeaderControls = {
	search: boolean;
	filter: boolean;
	sort: boolean;
	view: boolean;
};

/** Which of the library toolbar's view controls show: all of them, on the
 *  series page too, but none in an empty library, with nothing to search, sort or lay out. */
export function headerControls(view: { isEmptyLibrary?: boolean }): HeaderControls {
	const shown = !view.isEmptyLibrary;
	return { search: shown, filter: shown, sort: shown, view: shown };
}
