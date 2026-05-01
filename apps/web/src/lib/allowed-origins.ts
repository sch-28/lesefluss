/** Origins shared by CORS middleware and better-auth trustedOrigins. */
const DEV_ORIGINS = ["http://localhost", "http://localhost:3001"];

const CHROME_EXTENSION_ORIGIN_ID = "[a-p]{32}";
const CHROME_REDIRECT_ID = CHROME_EXTENSION_ORIGIN_ID;
// Firefox internal origin uses the addon UUID; the identity redirect URI uses
// a SHA-1 hash of the addon ID, surfaced as 40 hex chars (no dashes).
const FIREFOX_EXTENSION_ID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const FIREFOX_REDIRECT_HOST_HASH = "[0-9a-f]{40}";

const EXTENSION_ORIGIN_PATTERNS = [
	new RegExp(`^chrome-extension://${CHROME_EXTENSION_ORIGIN_ID}$`),
	new RegExp(`^moz-extension://${FIREFOX_EXTENSION_ID}$`),
];

const EXTENSION_REDIRECT_URI_PATTERNS = [
	new RegExp(`^https://${CHROME_REDIRECT_ID}\\.chromiumapp\\.org/?$`),
	new RegExp(`^https://${FIREFOX_REDIRECT_HOST_HASH}\\.extensions\\.allizom\\.org/?$`),
];

export const ALLOWED_ORIGINS: string[] = [
	"capacitor://localhost",
	"https://localhost",
	"lesefluss://",
	...(process.env.NODE_ENV === "production" ? [] : DEV_ORIGINS),
	process.env.BETTER_AUTH_URL,
].filter(Boolean) as string[];

function configuredValues(name: string): string[] {
	return (process.env[name] ?? "")
		.split(",")
		.map((value) => value.trim().toLowerCase())
		.filter(Boolean);
}

function isProduction(): boolean {
	return process.env.NODE_ENV === "production";
}

// Firefox uses the addon UUID for the moz-extension origin and a SHA-1 hash of
// the addon ID for the identity redirect URI host. Both forms can be listed in
// LESEFLUSS_FIREFOX_EXTENSION_IDS; we route each to the allowlist that matches
// its shape.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA1_RE = /^[0-9a-f]{40}$/;

function configuredExtensionOrigins(): Set<string> {
	const firefoxUuids = configuredValues("LESEFLUSS_FIREFOX_EXTENSION_IDS").filter((v) =>
		UUID_RE.test(v),
	);
	return new Set([
		...configuredValues("LESEFLUSS_CHROME_EXTENSION_IDS").map((id) => `chrome-extension://${id}`),
		...firefoxUuids.map((id) => `moz-extension://${id}`),
	]);
}

function configuredExtensionRedirectUris(): Set<string> {
	const firefoxRedirectHosts = configuredValues("LESEFLUSS_FIREFOX_EXTENSION_IDS").filter((v) =>
		SHA1_RE.test(v),
	);
	return new Set([
		...configuredValues("LESEFLUSS_CHROME_EXTENSION_IDS").map(
			(id) => `https://${id}.chromiumapp.org/`,
		),
		...firefoxRedirectHosts.map((host) => `https://${host}.extensions.allizom.org/`),
	]);
}

export function getTrustedAuthOrigins(request?: Request): string[] {
	const origin = request?.headers.get("origin") ?? null;
	return isAllowedCorsOrigin(origin) ? [...ALLOWED_ORIGINS, origin] : ALLOWED_ORIGINS;
}

const ALLOWED_ORIGINS_SET = new Set(ALLOWED_ORIGINS);

export function isAllowedCorsOrigin(origin: string | null): origin is string {
	return !!origin && (ALLOWED_ORIGINS_SET.has(origin) || isAllowedExtensionOrigin(origin));
}

export function isAllowedExtensionOrigin(origin: string): boolean {
	if (configuredExtensionOrigins().has(origin.toLowerCase())) return true;
	return !isProduction() && EXTENSION_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
}

export function isAllowedExtensionRedirectUri(redirectUri: string): boolean {
	const normalized = redirectUri.endsWith("/") ? redirectUri : `${redirectUri}/`;
	if (configuredExtensionRedirectUris().has(normalized.toLowerCase())) return true;
	return (
		!isProduction() && EXTENSION_REDIRECT_URI_PATTERNS.some((pattern) => pattern.test(redirectUri))
	);
}
