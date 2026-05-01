import {
	type AuthHandoffStorage,
	beginAuthHandoff,
	consumeAuthHandoffState,
	finalizeVerifiedAuthHandoffLogin,
} from "@lesefluss/core";
import { browser } from "wxt/browser";

import { parseAuthCallback } from "./auth-parse";
import { apiUrl, LESEFLUSS_URL } from "./config";

export { parseAuthCallback };

const TOKEN_KEY = "sync_token";
const USER_EMAIL_KEY = "sync_user_email";
const STATE_KEY = "sync_auth_state";

export interface AuthSession {
	token: string;
	email: string | null;
}

export const extensionAuthStorage: AuthHandoffStorage = {
	async get(key) {
		const values = await browser.storage.local.get(key);
		const value = values[key];
		return typeof value === "string" ? value : null;
	},
	async set(key, value) {
		await browser.storage.local.set({ [key]: value });
	},
	async remove(key) {
		await browser.storage.local.remove(key);
	},
};

export async function getAuthSession(): Promise<AuthSession | null> {
	const token = await extensionAuthStorage.get(TOKEN_KEY);
	if (!token) return null;
	const email = await extensionAuthStorage.get(USER_EMAIL_KEY);
	return { token, email };
}

export async function clearAuthSession(): Promise<void> {
	await Promise.all([
		extensionAuthStorage.remove(TOKEN_KEY),
		extensionAuthStorage.remove(USER_EMAIL_KEY),
		extensionAuthStorage.remove(STATE_KEY),
	]);
}

export async function signIn(): Promise<AuthSession> {
	const state = await beginAuthHandoff(extensionAuthStorage, { stateKey: STATE_KEY });
	const redirectUri = browser.identity.getRedirectURL();
	const url = new URL(apiUrl("/auth/extension-callback"));
	url.searchParams.set("redirect_uri", redirectUri);
	url.searchParams.set("state", state);

	let callbackUrl: string | undefined;
	try {
		callbackUrl = await browser.identity.launchWebAuthFlow({
			interactive: true,
			url: url.toString(),
		});
	} catch (error) {
		await consumeAuthHandoffState(extensionAuthStorage, { stateKey: STATE_KEY });
		throw error;
	}
	if (!callbackUrl) {
		await consumeAuthHandoffState(extensionAuthStorage, { stateKey: STATE_KEY });
		throw new Error("Sign-in was cancelled.");
	}

	const expectedState = await consumeAuthHandoffState(extensionAuthStorage, {
		stateKey: STATE_KEY,
	});
	const callback = parseAuthCallback(callbackUrl, redirectUri);
	if (!expectedState || callback.state !== expectedState) {
		throw new Error("Sign-in state verification failed.");
	}

	const { email } = await finalizeVerifiedAuthHandoffLogin(extensionAuthStorage, {
		token: callback.token,
		syncUrl: LESEFLUSS_URL,
		stateKey: STATE_KEY,
		userEmailKey: USER_EMAIL_KEY,
		tokenKey: TOKEN_KEY,
	});

	return { token: callback.token, email };
}

export async function signOut(): Promise<void> {
	const session = await getAuthSession();
	await clearAuthSession();

	if (!session) return;
	try {
		await fetch(apiUrl("/api/auth/sign-out"), {
			method: "POST",
			headers: { Authorization: `Bearer ${session.token}` },
		});
	} catch {
		// Local sign-out must succeed even when the network is unavailable.
	}
}
