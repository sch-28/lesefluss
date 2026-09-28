import { Preferences } from "@capacitor/preferences";
import {
	type AuthHandoffStorage,
	beginAuthHandoff,
	consumeAuthHandoffState,
	finalizeVerifiedAuthHandoffLogin,
} from "@lesefluss/core";
import { clearPendingLink } from "../deep-links/pending-link";
import { clearSocialQueries } from "../social/cache";
import { SYNC_URL } from "./auth-client";
import { clearServerContentIds } from "./server-content-cache";

/** True when the capacitor app is hosted inside the website (same origin, cookie auth). */
export const IS_WEB_BUILD = import.meta.env.VITE_WEB_BUILD === "true";

/** Sync is available when explicitly configured OR running as web embed. */
export const SYNC_ENABLED = !!SYNC_URL || IS_WEB_BUILD;

/** True when sync runs on native (bearer token) rather than as a web embed (cookie). */
export const NATIVE_SYNC_ENABLED = SYNC_ENABLED && !IS_WEB_BUILD;

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

const TOKEN_KEY = "sync_token";
export const LAST_SYNCED_KEY = "sync_last_synced";
const USER_EMAIL_KEY = "sync_user_email";
const AUTH_STATE_KEY = "sync_auth_state";
export const SESSIONS_PUSHED_KEY = "sync_sessions_pushed_at";

const preferencesAuthStorage: AuthHandoffStorage = {
	async get(key) {
		const { value } = await Preferences.get({ key });
		return value;
	},
	async set(key, value) {
		await Preferences.set({ key, value });
	},
	async remove(key) {
		await Preferences.remove({ key });
	},
};

const authHandoffOptions = {
	stateKey: AUTH_STATE_KEY,
	tokenKey: TOKEN_KEY,
	userEmailKey: USER_EMAIL_KEY,
};

export async function getToken(): Promise<string | null> {
	const { value } = await Preferences.get({ key: TOKEN_KEY });
	return value;
}

const sessionLostListeners = new Set<() => void>();

/**
 * Fires when the server rejected the session and the local one was dropped in
 * response, so UI that mirrors "signed in" in React state can follow and tell
 * the user. A sign-out the user asked for does not fire it.
 */
export function onSessionLost(listener: () => void): () => void {
	sessionLostListeners.add(listener);
	return () => sessionLostListeners.delete(listener);
}

export function notifySessionLost(): void {
	for (const listener of sessionLostListeners) listener();
}

export async function clearToken(): Promise<void> {
	await Preferences.remove({ key: TOKEN_KEY });
	await Preferences.remove({ key: USER_EMAIL_KEY });
	await Preferences.remove({ key: AUTH_STATE_KEY });
	await clearAccountScopedState();
}

/**
 * Drop everything that describes what one specific account's server already holds.
 * Carried into another account it suppresses uploads that account still needs.
 */
export async function clearAccountScopedState(): Promise<void> {
	await clearServerContentIds();
	await resetSessionPushWatermark();
	clearSocialQueries();
	await clearPendingLink();
}

/**
 * Bind the local caches to whoever is signed in now, clearing them on a change of
 * account. The web build has no in-app sign-out (the site header calls better-auth
 * directly) and its 401 path never clears a token, so this is the only point where
 * a browser-side account switch is noticed.
 */
export async function adoptSyncIdentity(email: string | null): Promise<void> {
	const { value: previous } = await Preferences.get({ key: USER_EMAIL_KEY });
	if (previous === email) return;
	await clearAccountScopedState();
	if (email) await Preferences.set({ key: USER_EMAIL_KEY, value: email });
	else await Preferences.remove({ key: USER_EMAIL_KEY });
}

/**
 * Reading sessions are pushed incrementally against this watermark. Reset it to
 * force the next push to resend every local session, needed after any flow that
 * wipes sessions server-side, otherwise local rows stay permanently unpushable.
 */
export async function resetSessionPushWatermark(): Promise<void> {
	await Preferences.remove({ key: SESSIONS_PUSHED_KEY });
}

export async function getSessionPushWatermark(): Promise<number> {
	const { value } = await Preferences.get({ key: SESSIONS_PUSHED_KEY });
	const parsed = value ? Number(value) : 0;
	// A corrupt value would otherwise reach the query as NaN, which binds NULL and
	// matches no rows, silently stopping session sync for good.
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Whether a sync request can be made now: sync must be enabled, and on native
 * a Bearer token must be present. Logged-out / non-syncing users skip server
 * calls instead of erroring.
 */
export async function isSyncReady(): Promise<boolean> {
	if (!SYNC_ENABLED) return false;
	if (!IS_WEB_BUILD && !(await getToken())) return false;
	return true;
}

export async function getLastSynced(): Promise<number | null> {
	const { value } = await Preferences.get({ key: LAST_SYNCED_KEY });
	return value ? Number(value) : null;
}

export async function getUserEmail(): Promise<string | null> {
	const { value } = await Preferences.get({ key: USER_EMAIL_KEY });
	return value;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/**
 * Start an auth handoff: generate a random state, persist it, and return
 * it to be embedded in the web callback URL. Paired with {@link consumeAuthLoginHandoffState}
 * to defend the deep-link callback against session fixation from other apps.
 */
export async function beginAuthLoginHandoff(): Promise<string> {
	return beginAuthHandoff(preferencesAuthStorage, authHandoffOptions);
}

/**
 * Read and clear the pending login state. Call from the deep-link handler and
 * compare against the state echoed back in the callback URL. Concurrent callers
 * get `null` — only the first wins, which prevents two racing `appUrlOpen`
 * events from both passing the state check off the same pending nonce.
 */
export async function consumeAuthLoginHandoffState(): Promise<string | null> {
	return consumeAuthHandoffState(preferencesAuthStorage, authHandoffOptions);
}

/**
 * Store a session token obtained from the deep-link callback and fetch the user
 * email to populate local state. Only call this after verifying the nonce state
 * — the caller is trusted to have confirmed the token is ours, not an attacker's.
 */
export async function finalizeVerifiedAuthLoginHandoff(token: string): Promise<{ email: string }> {
	return finalizeVerifiedAuthHandoffLogin(preferencesAuthStorage, {
		...authHandoffOptions,
		token,
		syncUrl: SYNC_URL,
	});
}
