import { Browser } from "@capacitor/browser";
import { SYNC_URL } from "./auth-client";
import { beginAuthLoginHandoff } from "./session";

/**
 * Native sign-in through the system browser: the website signs the user in
 * and bounces back through the `lesefluss://auth-callback` deep link, which
 * sync-context completes after checking the state nonce issued here.
 */
export async function openBrowserSignIn(): Promise<void> {
	const state = await beginAuthLoginHandoff();
	await Browser.open({
		url: `${SYNC_URL}/auth/mobile-callback?state=${encodeURIComponent(state)}`,
	});
}
