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

/**
 * The header's selection control. A phone selects by long press and gets none. On desktop it
 * is Select where a selection can start, and once selecting it stays put as Done, the way out,
 * whatever view the selection has since moved to.
 */
export function selectControl(state: {
	isDesktop: boolean;
	isSelecting: boolean;
	canSelect: boolean;
}): "select" | "done" | null {
	if (!state.isDesktop) return null;
	if (state.isSelecting) return "done";
	return state.canSelect ? "select" : null;
}
