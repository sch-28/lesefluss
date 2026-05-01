/**
 * Parse the URL that `browser.identity.launchWebAuthFlow` returns when the
 * `/auth/extension-callback` page redirects back to the extension's redirect
 * URI. The token + state are encoded in the URL fragment so they never leave
 * the browser as referer or in server access logs.
 */
export function parseAuthCallback(
	callbackUrl: string,
	expectedRedirectUri: string,
): { token: string; state: string | null } {
	const url = new URL(callbackUrl);
	const expected = new URL(expectedRedirectUri);
	if (
		url.origin !== expected.origin ||
		url.pathname !== expected.pathname ||
		url.search !== expected.search
	) {
		throw new Error("Sign-in returned from an unexpected redirect URL.");
	}

	const params = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
	const token = params.get("token");
	if (!token) throw new Error("Sign-in did not return a session token.");
	return { token, state: params.get("state") };
}
