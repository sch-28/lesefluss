// validateSearch also runs on the server, where there is no location.origin, so
// values resolve against a placeholder origin that no real URL can share.
const BASE = "http://redirect.invalid";

/**
 * The same-origin path a `?redirect=` value points to, normalised the way the
 * browser will resolve it, or undefined when it would leave the site or land
 * on the login page or an auth endpoint.
 */
export function safeRedirectPath(value: unknown): string | undefined {
	if (typeof value !== "string" || !value.startsWith("/")) return undefined;
	let url: URL;
	try {
		url = new URL(value, BASE);
	} catch {
		return undefined;
	}
	const path = url.pathname;
	// Dot segments can normalise "/.//evil.example" into "//evil.example", which is same-origin
	// here but scheme-relative once the browser resolves it again.
	if (url.origin !== BASE || path.startsWith("//")) return undefined;
	if (isLoginOrApiPath(path)) return undefined;
	return path + url.search + url.hash;
}

// Avoid bouncing back to login (reload loop) or exposing auth endpoints as redirect
// targets. TanStack Router decodes each escape on its own, drops control characters and
// matches case-insensitively, so "/LOGIN", "/%41pi" and "/log%00in" count too.
function isLoginOrApiPath(path: string): boolean {
	const routed = path
		.replace(/%[0-9a-f]{2}/gi, decodeEscape)
		.replace(/\p{Cc}/gu, "")
		.toLowerCase();
	return ["/login", "/api"].some((prefix) => routed === prefix || routed.startsWith(`${prefix}/`));
}

function decodeEscape(sequence: string): string {
	try {
		return decodeURIComponent(sequence);
	} catch {
		return sequence;
	}
}
