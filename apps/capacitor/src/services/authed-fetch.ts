import { log } from "../utils/log";
import { SYNC_URL } from "./sync/auth-client";
import {
	clearAccountScopedState,
	clearToken,
	getToken,
	IS_WEB_BUILD,
	notifySessionLost,
} from "./sync/session";

export type AuthedFetchOptions = Omit<RequestInit, "headers"> & {
	headers?: Record<string, string>;
};

/** A non-2xx response. `body` is the parsed JSON when the server sent any. */
export class AuthedFetchError extends Error {
	constructor(
		readonly status: number,
		readonly text: string,
		readonly body: unknown,
	) {
		super(`Request failed (${status})`);
		this.name = "AuthedFetchError";
	}
}

/**
 * Fetch against the sync server as the signed-in user: bearer token on native,
 * the session cookie in the web build. A 401 drops the local session state
 * before throwing so the app cannot keep acting on a token the server rejects.
 */
export async function authedFetch(path: string, options?: AuthedFetchOptions): Promise<Response> {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		...options?.headers,
	};

	if (!IS_WEB_BUILD) {
		const token = await getToken();
		if (!token) throw new Error("Not authenticated");
		headers.Authorization = `Bearer ${token}`;
	}

	const url = `${SYNC_URL}${path}`;
	const method = options?.method ?? "GET";
	let res: Response;
	try {
		res = await fetch(url, {
			...options,
			credentials: IS_WEB_BUILD ? "include" : undefined,
			headers,
		});
	} catch (err) {
		// Diagnostics for "TypeError: Failed to fetch", which strips every detail.
		const headerBytes = Object.entries(headers).reduce(
			(n, [k, v]) => n + k.length + v.length + 4,
			0,
		);
		const haveHeader = headers["X-Sync-Have"] ?? "";
		const haveCount = haveHeader ? haveHeader.split(",").filter(Boolean).length : 0;
		const bodyDesc =
			typeof options?.body === "string"
				? `${options.body.length}b`
				: options?.body
					? "non-string"
					: "none";
		log.error(
			"fetch",
			`fetch threw url=${url} method=${method} online=${typeof navigator !== "undefined" ? navigator.onLine : "n/a"} headerBytes=${headerBytes} haveHeaderBytes=${haveHeader.length} haveCount=${haveCount} body=${bodyDesc} errorName=${err instanceof Error ? err.name : typeof err} errorMessage=${err instanceof Error ? err.message : String(err)}`,
		);
		if (err instanceof Error && err.stack) log.error("fetch", "fetch threw stack:", err.stack);
		throw err;
	}

	if (res.status === 401) {
		// The web build keeps no token to clear, but the account-scoped caches are
		// still stale the moment the session is gone.
		if (IS_WEB_BUILD) await clearAccountScopedState();
		else await clearToken();
		notifySessionLost();
		throw new Error("Session expired");
	}

	if (!res.ok) {
		const text = await res.text().catch(() => "");
		let body: unknown = null;
		try {
			body = text ? JSON.parse(text) : null;
		} catch {
			body = null;
		}
		throw new AuthedFetchError(res.status, text, body);
	}

	return res;
}
