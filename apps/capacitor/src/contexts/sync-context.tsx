import { App as CapacitorApp, type URLOpenListenerEvent } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import type { PluginListenerHandle } from "@capacitor/core";
import type React from "react";
import {
	createContext,
	type Dispatch,
	type ReactNode,
	type SetStateAction,
	useCallback,
	useContext,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { toast } from "../components/toast";
import {
	consumeAuthState,
	finalizeVerifiedLogin,
	fullSync,
	getLastSynced,
	getToken,
	getUserEmail,
	hasEmail,
	IS_WEB_BUILD,
	NATIVE_SYNC_ENABLED,
	SYNC_ENABLED,
	signOut as syncSignOut,
} from "../services/sync";
import { log } from "../utils/log";

interface SyncContextType {
	isLoggedIn: boolean;
	userEmail: string | null;
	isSyncing: boolean;
	lastSynced: number | null;
	syncError: string | null;
	logout: () => Promise<void>;
	syncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType | null>(null);

export function useSyncContext(): SyncContextType {
	const ctx = useContext(SyncContext);
	if (!ctx) throw new Error("useSyncContext must be used within SyncProvider");
	return ctx;
}

// --- Capacitor App listener hooks -------------------------------------------

/**
 * Shared register/cleanup skeleton for Capacitor listener hooks. `register`
 * must call `CapacitorApp.addListener(...)` internally; the skeleton handles
 * ref-based handler freshness, race-free cleanup, and rejection logging.
 */
function useCapacitorListener<H>(
	register: (invokeLatest: H) => Promise<PluginListenerHandle>,
	handler: H,
	enabled: boolean,
	label: string,
) {
	const handlerRef = useRef(handler);
	useLayoutEffect(() => {
		handlerRef.current = handler;
	});

	useEffect(() => {
		if (!enabled) return;
		let cancelled = false;
		let handle: PluginListenerHandle | null = null;

		// Forward to the latest handler via the ref so callers can pass inline
		// lambdas without re-registering on every render.
		const proxy = ((...args: unknown[]) =>
			(handlerRef.current as (...a: unknown[]) => unknown)(...args)) as H;

		register(proxy)
			.then((h) => {
				if (cancelled) void h.remove();
				else handle = h;
			})
			.catch((err) => log.warn("sync", `${label} listener failed:`, err));

		return () => {
			cancelled = true;
			void handle?.remove();
		};
	}, [enabled, register, label]);
}

function useAppUrlOpenListener(
	handler: (event: URLOpenListenerEvent) => void | Promise<void>,
	enabled: boolean,
) {
	const register = useCallback(
		(invoke: (event: URLOpenListenerEvent) => void | Promise<void>) =>
			CapacitorApp.addListener("appUrlOpen", invoke),
		[],
	);
	useCapacitorListener(register, handler, enabled, "appUrlOpen");
}

function useAppResumeListener(handler: () => void | Promise<void>, enabled: boolean) {
	const register = useCallback(
		(invoke: () => void | Promise<void>) => CapacitorApp.addListener("resume", invoke),
		[],
	);
	useCapacitorListener(register, handler, enabled, "resume");
}

// --- Sync sub-hooks ---------------------------------------------------------

function useRestoreSession(
	setIsLoggedIn: Dispatch<SetStateAction<boolean>>,
	setUserEmail: Dispatch<SetStateAction<string | null>>,
	setLastSynced: Dispatch<SetStateAction<number | null>>,
) {
	useEffect(() => {
		if (!SYNC_ENABLED) return;

		(async () => {
			try {
				if (IS_WEB_BUILD) {
					const res = await fetch("/api/auth/get-session", { credentials: "include" });
					if (!res.ok) return;
					const data: unknown = await res.json();
					const user =
						typeof data === "object" && data !== null
							? (data as { user?: unknown }).user
							: undefined;
					if (!hasEmail(user)) return;
					setIsLoggedIn(true);
					setUserEmail(user.email);
				} else {
					const token = await getToken();
					if (!token) return;
					setIsLoggedIn(true);
					setUserEmail(await getUserEmail());
					setLastSynced(await getLastSynced());
				}
				await fullSync();
				setLastSynced(Date.now());
			} catch (err) {
				log.warn("sync", "initial sync failed:", err);
			}
		})();
	}, [setIsLoggedIn, setLastSynced, setUserEmail]);
}

function useResumeSync(setLastSynced: Dispatch<SetStateAction<number | null>>) {
	useAppResumeListener(async () => {
		const token = await getToken();
		if (!token) return;
		try {
			await fullSync();
			setLastSynced(Date.now());
		} catch (err) {
			log.warn("sync", "resume sync failed:", err);
		}
	}, NATIVE_SYNC_ENABLED);
}

function useMobileAuthCallback(
	setIsLoggedIn: Dispatch<SetStateAction<boolean>>,
	setUserEmail: Dispatch<SetStateAction<string | null>>,
	setIsSyncing: Dispatch<SetStateAction<boolean>>,
	setLastSynced: Dispatch<SetStateAction<number | null>>,
	setSyncError: Dispatch<SetStateAction<string | null>>,
) {
	// Dedupe: cold-start `getLaunchUrl()` and the `appUrlOpen` listener can both
	// surface the same URL on some devices; only process each URL once.
	const lastHandledUrl = useRef<string | null>(null);

	const handleUrl = useCallback(
		async (url: string) => {
			if (lastHandledUrl.current === url) return;
			lastHandledUrl.current = url;

			// Prefix match instead of `parsed.host` — older Android WebViews
			// (e.g. on the Ayn Thor) parse non-special schemes such that
			// `new URL("lesefluss://auth-callback?…").host` is the empty string
			// while newer WebViews return "auth-callback". The prefix check
			// works on both.
			if (!url.startsWith("lesefluss://auth-callback")) return;

			let parsed: URL;
			try {
				parsed = new URL(url);
			} catch {
				return;
			}

			const expectedState = await consumeAuthState();
			const receivedState = parsed.searchParams.get("state");
			if (!expectedState || expectedState !== receivedState) {
				const msg = "Sign-in rejected: invalid state";
				setSyncError(msg);
				toast.error(msg);
				log.warn("auth", "mobile login state mismatch");
				return;
			}

			const token = parsed.searchParams.get("token");
			if (!token) {
				const msg = "Sign-in failed: no token returned";
				setSyncError(msg);
				toast.error(msg);
				return;
			}

			setSyncError(null);
			setIsSyncing(true);
			try {
				const { email } = await finalizeVerifiedLogin(token);
				setIsLoggedIn(true);
				setUserEmail(email || null);
				await Browser.close().catch(() => {});
				await fullSync();
				setLastSynced(Date.now());
				toast.success(email ? `Signed in as ${email}` : "Signed in");
			} catch (err) {
				const msg = err instanceof Error ? err.message : "Sign-in failed";
				setSyncError(msg);
				toast.error(msg);
				log.error("auth", "mobile login failed:", err);
			} finally {
				setIsSyncing(false);
			}
		},
		[setIsLoggedIn, setUserEmail, setIsSyncing, setLastSynced, setSyncError],
	);

	useAppUrlOpenListener(({ url }) => void handleUrl(url), NATIVE_SYNC_ENABLED);

	// Cold-start case: Android killed the app during the OAuth round-trip and
	// re-launched it via the deep-link intent. Capacitor doesn't replay the
	// `appUrlOpen` event for the launching intent, so we have to fetch the
	// URL ourselves on mount.
	useEffect(() => {
		if (!NATIVE_SYNC_ENABLED) return;
		CapacitorApp.getLaunchUrl()
			.then((result) => {
				if (result?.url) void handleUrl(result.url);
			})
			.catch((err) => log.warn("auth", "getLaunchUrl failed:", err));
	}, [handleUrl]);
}

// --- Provider ---------------------------------------------------------------

export const SyncProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
	const [isLoggedIn, setIsLoggedIn] = useState(false);
	const [userEmail, setUserEmail] = useState<string | null>(null);
	const [isSyncing, setIsSyncing] = useState(false);
	const [lastSynced, setLastSynced] = useState<number | null>(null);
	const [syncError, setSyncError] = useState<string | null>(null);

	useRestoreSession(setIsLoggedIn, setUserEmail, setLastSynced);
	useResumeSync(setLastSynced);
	useMobileAuthCallback(setIsLoggedIn, setUserEmail, setIsSyncing, setLastSynced, setSyncError);

	const logout = useCallback(async () => {
		await syncSignOut();
		setIsLoggedIn(false);
		setUserEmail(null);
		setLastSynced(null);
		setSyncError(null);
	}, []);

	const syncNow = useCallback(async () => {
		setSyncError(null);
		setIsSyncing(true);
		try {
			await fullSync();
			setLastSynced(Date.now());
			toast.success("Synced");
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Sync failed";
			setSyncError(msg);
			toast.error(msg);
		} finally {
			setIsSyncing(false);
		}
	}, []);

	const value: SyncContextType = {
		isLoggedIn,
		userEmail,
		isSyncing,
		lastSynced,
		syncError,
		logout,
		syncNow,
	};

	return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
};
