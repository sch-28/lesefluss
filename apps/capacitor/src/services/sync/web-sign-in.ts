/**
 * The website's sign-in page, which sends the user back to `appPath` (a path under
 * /app/) once signed in. Without the redirect /login lands on the website profile.
 */
export function webSignInHref(appPath: string): string {
	return `/login?redirect=${encodeURIComponent(appPath)}`;
}
