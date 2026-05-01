/** Origins shared by CORS middleware and better-auth trustedOrigins. */
const DEV_ORIGINS = ["http://localhost", "http://localhost:3001"];

const CHROME_EXTENSION_ORIGIN_ID = "[a-p]{32}";
const CHROME_REDIRECT_ID = CHROME_EXTENSION_ORIGIN_ID;
const FIREFOX_EXTENSION_ID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const EXTENSION_ORIGIN_PATTERNS = [
	new RegExp(`^chrome-extension://${CHROME_EXTENSION_ORIGIN_ID}$`),
	new RegExp(`^moz-extension://${FIREFOX_EXTENSION_ID}$`),
];

const EXTENSION_REDIRECT_URI_PATTERNS = [
	new RegExp(`^https://${CHROME_REDIRECT_ID}\\.chromiumapp\\.org/?$`),
	new RegExp(`^https://${FIREFOX_EXTENSION_ID}\\.extensions\\.allizom\\.org/?$`),
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

function configuredExtensionOrigins(): Set<string> {
	return new Set([
		...configuredValues("LESEFLUSS_CHROME_EXTENSION_IDS").map((id) => `chrome-extension://${id}`),
		...configuredValues("LESEFLUSS_FIREFOX_EXTENSION_IDS").map((id) => `moz-extension://${id}`),
	]);
}

function configuredExtensionRedirectUris(): Set<string> {
	return new Set([
		...configuredValues("LESEFLUSS_CHROME_EXTENSION_IDS").map(
			(id) => `https://${id}.chromiumapp.org/`,
		),
		...configuredValues("LESEFLUSS_FIREFOX_EXTENSION_IDS").map(
			(id) => `https://${id}.extensions.allizom.org/`,
		),
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
