export type BackAction = { kind: "back" } | { kind: "replace"; to: string } | { kind: "exit" };

const LIBRARY = "/tabs/library";
const EXPLORE = "/tabs/explore";
const ROOT_TABS = new Set(["/tabs/stats", "/tabs/explore", "/tabs/social", "/tabs/settings"]);

/**
 * What Android Back does once no overlay or mode took the press: a sub-page goes
 * to the page that opened it, Sessions opened from a book to that book, a Stats
 * sub-tab to Overview, any other root tab to the Library, and the Library exits. Root tabs never walk router history: tab
 * switches pile it up, and Back used to replay pages from minutes earlier.
 */
export function resolveBack(pathname: string, search: string, canGoBack: boolean): BackAction {
	const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
	if (path === LIBRARY && isLibrarySubView(search)) {
		return canGoBack ? { kind: "back" } : { kind: "replace", to: LIBRARY };
	}
	if (path === EXPLORE && isExploreSubView(search)) {
		return canGoBack ? { kind: "back" } : { kind: "replace", to: EXPLORE };
	}
	if (path === "/" || path === LIBRARY) return { kind: "exit" };
	if (path === "/tabs/stats") {
		const params = new URLSearchParams(search);
		const book = params.get("book");
		if (params.get("from") === "book" && book) {
			return canGoBack
				? { kind: "back" }
				: { kind: "replace", to: `/tabs/library/book/${encodeURIComponent(book)}` };
		}
		if (params.has("tab")) return { kind: "replace", to: "/tabs/stats" };
	}
	if (ROOT_TABS.has(path)) return { kind: "replace", to: LIBRARY };
	if (canGoBack) return { kind: "back" };
	if (path.startsWith("/onboarding")) return { kind: "exit" };
	return { kind: "replace", to: coldParentOf(path) ?? tabRootOf(path) };
}

/** A series, collection or smart shelf opens on the Library route itself, as a search param. */
function isLibrarySubView(search: string): boolean {
	const params = new URLSearchParams(search);
	return params.has("collection") || params.has("shelf");
}

/** Search, a genre, an author, tags or a length filter: results views on top of the Explore landing. */
function isExploreSubView(search: string): boolean {
	const params = new URLSearchParams(search);
	return ["q", "genre", "author", "tags", "length", "fits", "scope"].some((key) => params.has(key));
}

/**
 * Sub-pages whose parent is not their tab's root. Each page's own Back or Close
 * falls back to the same place, so header Back and Android back agree.
 */
const COLD_PARENTS: [RegExp, (id: string) => string][] = [
	[/^\/tabs\/library\/book\/([^/]+)\/edit$/, (id) => `/tabs/library/book/${id}`],
	[
		/^\/tabs\/library\/collections\/([^/]+)\/(?:add|edit)$/,
		(id) => `/tabs/library?collection=${id}`,
	],
	[/^\/tabs\/social\/buddy-read\/([^/]+)$/, () => "/tabs/social/buddy-reads"],
	[/^\/speed-test$/, () => "/tabs/stats?tab=speed"],
];

function coldParentOf(path: string): string | null {
	for (const [pattern, parent] of COLD_PARENTS) {
		const match = pattern.exec(path);
		if (match) return parent(match[1] ?? "");
	}
	return null;
}

/** The root tab a sub-page lives under, for a sub-page opened without history (a link from outside). */
function tabRootOf(path: string): string {
	const root = path.split("/").slice(0, 3).join("/");
	return ROOT_TABS.has(root) ? root : LIBRARY;
}
