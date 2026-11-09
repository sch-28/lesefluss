export type BackAction = { kind: "back" } | { kind: "replace"; to: string } | { kind: "exit" };

const LIBRARY = "/tabs/library";
const ROOT_TABS = new Set(["/tabs/stats", "/tabs/explore", "/tabs/social", "/tabs/settings"]);

/**
 * What Android Back does once no overlay or mode took the press: a sub-page goes
 * to the page that opened it, a Stats sub-tab to Overview, any other root tab to
 * the Library, and the Library exits. Root tabs never walk router history: tab
 * switches pile it up, and Back used to replay pages from minutes earlier.
 */
export function resolveBack(pathname: string, search: string, canGoBack: boolean): BackAction {
	const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
	if (path === LIBRARY && isLibrarySubView(search)) {
		return canGoBack ? { kind: "back" } : { kind: "replace", to: LIBRARY };
	}
	if (path === "/" || path === LIBRARY) return { kind: "exit" };
	if (path === "/tabs/stats" && new URLSearchParams(search).has("tab")) {
		return { kind: "replace", to: "/tabs/stats" };
	}
	if (ROOT_TABS.has(path)) return { kind: "replace", to: LIBRARY };
	if (canGoBack) return { kind: "back" };
	if (path.startsWith("/onboarding")) return { kind: "exit" };
	return { kind: "replace", to: tabRootOf(path) };
}

/** A series, collection or smart shelf opens on the Library route itself, as a search param. */
function isLibrarySubView(search: string): boolean {
	const params = new URLSearchParams(search);
	return params.has("collection") || params.has("shelf");
}

/** The root tab a sub-page lives under, for a sub-page opened without history (a link from outside). */
function tabRootOf(path: string): string {
	const root = path.split("/").slice(0, 3).join("/");
	return ROOT_TABS.has(root) ? root : LIBRARY;
}
