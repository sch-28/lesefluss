export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=app.lesefluss";

/**
 * Opens the invite in the installed app, or the Play Store listing without it. Works
 * where the https App Link is not verified, because the intent names the package.
 * Keep in sync with the claimed paths in docs/deep-links.md.
 */
export function appInviteIntentUrl(token: string): string {
	const fallback = encodeURIComponent(PLAY_STORE_URL);
	return `intent://lesefluss.app/invite/${encodeURIComponent(token)}#Intent;scheme=https;package=app.lesefluss;S.browser_fallback_url=${fallback};end`;
}
