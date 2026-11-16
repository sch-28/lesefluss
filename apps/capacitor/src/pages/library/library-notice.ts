/** The one notice the library shows: the local-storage warning outranks the web-limits line. */
export function libraryNotice(state: {
	isSubPage: boolean;
	isWebBuild: boolean;
	isWeb: boolean;
	isLoggedIn: boolean;
	isLocalNoticeDismissed: boolean;
}): "local-storage" | "web-limits" | null {
	if (state.isSubPage) return null;
	if (state.isWebBuild && !state.isLoggedIn && !state.isLocalNoticeDismissed)
		return "local-storage";
	return state.isWeb ? "web-limits" : null;
}
