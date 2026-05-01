export interface AuthHandoffStorage {
	get(key: string): Promise<string | null>;
	set(key: string, value: string): Promise<void>;
	remove(key: string): Promise<void>;
}

export interface AuthHandoffOptions {
	stateKey?: string;
	userEmailKey?: string;
	tokenKey?: string;
	generateState?: () => string;
}

export interface FinalizeAuthHandoffLoginOptions extends AuthHandoffOptions {
	token: string;
	syncUrl: string;
	fetch?: typeof fetch;
}

const DEFAULT_STATE_KEY = "sync_auth_state";
const DEFAULT_USER_EMAIL_KEY = "sync_user_email";
const DEFAULT_TOKEN_KEY = "sync_token";

const consumeLocks = new WeakMap<AuthHandoffStorage, Set<string>>();

function getStateKey(options?: AuthHandoffOptions): string {
	return options?.stateKey ?? DEFAULT_STATE_KEY;
}

function getUserEmailKey(options?: AuthHandoffOptions): string {
	return options?.userEmailKey ?? DEFAULT_USER_EMAIL_KEY;
}

function getTokenKey(options?: AuthHandoffOptions): string {
	return options?.tokenKey ?? DEFAULT_TOKEN_KEY;
}

function defaultGenerateState(): string {
	return crypto.randomUUID();
}

function hasEmail(v: unknown): v is { email: string } {
	return (
		typeof v === "object" && v !== null && typeof (v as { email?: unknown }).email === "string"
	);
}

async function clearStoredAuth(
	authStorage: AuthHandoffStorage,
	options?: AuthHandoffOptions,
): Promise<void> {
	await Promise.all([
		authStorage.remove(getTokenKey(options)),
		authStorage.remove(getUserEmailKey(options)),
		authStorage.remove(getStateKey(options)),
	]);
}

function getConsumeLocks(authStorage: AuthHandoffStorage): Set<string> {
	let locks = consumeLocks.get(authStorage);
	if (!locks) {
		locks = new Set<string>();
		consumeLocks.set(authStorage, locks);
	}
	return locks;
}

/**
 * Start an auth handoff by generating and storing a nonce state. The caller must
 * include the returned state in the web callback URL and verify it on return.
 */
export async function beginAuthHandoff(
	authStorage: AuthHandoffStorage,
	options?: AuthHandoffOptions,
): Promise<string> {
	const state = (options?.generateState ?? defaultGenerateState)();
	await authStorage.set(getStateKey(options), state);
	return state;
}

/**
 * Read and remove the pending auth state exactly once. Concurrent callers using
 * the same storage key get null while the first consume is in flight.
 */
export async function consumeAuthHandoffState(
	authStorage: AuthHandoffStorage,
	options?: AuthHandoffOptions,
): Promise<string | null> {
	const stateKey = getStateKey(options);
	const locks = getConsumeLocks(authStorage);
	if (locks.has(stateKey)) return null;
	locks.add(stateKey);
	try {
		const value = await authStorage.get(stateKey);
		await authStorage.remove(stateKey);
		return value;
	} finally {
		locks.delete(stateKey);
	}
}

/**
 * Store a verified session token, then fetch the user session to cache the email.
 * Only call this after the caller has verified the handoff nonce state.
 */
export async function finalizeVerifiedAuthHandoffLogin(
	authStorage: AuthHandoffStorage,
	options: FinalizeAuthHandoffLoginOptions,
): Promise<{ email: string }> {
	const fetchImpl = options.fetch ?? fetch;
	await authStorage.set(getTokenKey(options), options.token);

	let res: Response;
	try {
		res = await fetchImpl(`${options.syncUrl}/api/auth/get-session`, {
			headers: { Authorization: `Bearer ${options.token}` },
		});
	} catch (err) {
		await clearStoredAuth(authStorage, options);
		throw err;
	}
	if (!res.ok) {
		await clearStoredAuth(authStorage, options);
		throw new Error(`Failed to verify session (${res.status})`);
	}

	try {
		const data: unknown = await res.json();
		const user =
			typeof data === "object" && data !== null ? (data as { user?: unknown }).user : undefined;
		if (!hasEmail(user)) {
			await clearStoredAuth(authStorage, options);
			throw new Error("Invalid session response");
		}

		await authStorage.set(getUserEmailKey(options), user.email);
		return { email: user.email };
	} catch (err) {
		await clearStoredAuth(authStorage, options);
		throw err;
	}
}
