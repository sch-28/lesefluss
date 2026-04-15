import { App as CapacitorApp } from "@capacitor/app";
import type React from "react";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import {
	fullSync,
	getLastSynced,
	getToken,
	getUserEmail,
	IS_WEB_BUILD,
	SYNC_ENABLED,
	signIn as syncSignIn,
	signOut as syncSignOut,
	signUp as syncSignUp,
} from "../services/sync";
import { log } from "../utils/log";

interface SyncContextType {
	isLoggedIn: boolean;
	userEmail: string | null;
	isSyncing: boolean;
	lastSynced: number | null;
	syncError: string | null;
	login: (email: string, password: string) => Promise<void>;
	register: (name: string, email: string, password: string) => Promise<void>;
	logout: () => Promise<void>;
	syncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType | null>(null);

export function useSyncContext(): SyncContextType {
	const ctx = useContext(SyncContext);
	if (!ctx) throw new Error("useSyncContext must be used within SyncProvider");
	return ctx;
}

export const SyncProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
	const [isLoggedIn, setIsLoggedIn] = useState(false);
	const [userEmail, setUserEmail] = useState<string | null>(null);
	const [isSyncing, setIsSyncing] = useState(false);
	const [lastSynced, setLastSynced] = useState<number | null>(null);
	const [syncError, setSyncError] = useState<string | null>(null);

	// Restore session on mount
	useEffect(() => {
		if (!SYNC_ENABLED) return;

		(async () => {
			try {
				if (IS_WEB_BUILD) {
					// Web embed: check session via cookie-based auth endpoint
					const res = await fetch("/api/auth/get-session", { credentials: "include" });
					if (res.ok) {
						const session: { user?: { email?: string } } | null = await res.json();
						if (session?.user) {
							setIsLoggedIn(true);
							setUserEmail(session.user.email ?? null);
							await fullSync();
							setLastSynced(Date.now());
						}
					}
				} else {
					const token = await getToken();
					if (token) {
						setIsLoggedIn(true);
						setUserEmail(await getUserEmail());
						setLastSynced(await getLastSynced());
						await fullSync();
						setLastSynced(Date.now());
					}
				}
			} catch (err) {
				log.warn("sync", "initial sync failed:", err);
			}
		})();
	}, []);

	// Pull on app resume
	useEffect(() => {
		if (!SYNC_ENABLED || IS_WEB_BUILD) return;

		const listener = CapacitorApp.addListener("resume", async () => {
			const token = await getToken();
			if (!token) return;

			try {
				await fullSync();
				setLastSynced(Date.now());
			} catch (err) {
				log.warn("sync", "resume sync failed:", err);
			}
		});

		return () => {
			listener.then((l) => l.remove());
		};
	}, []);

	const login = useCallback(async (email: string, password: string) => {
		setSyncError(null);
		try {
			const result = await syncSignIn(email, password);
			setIsLoggedIn(true);
			setUserEmail(result.email);

			// Initial sync after login
			setIsSyncing(true);
			await fullSync();
			setLastSynced(Date.now());
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Login failed";
			setSyncError(msg);
			throw err;
		} finally {
			setIsSyncing(false);
		}
	}, []);

	const register = useCallback(async (name: string, email: string, password: string) => {
		setSyncError(null);
		try {
			const result = await syncSignUp(name, email, password);
			setIsLoggedIn(true);
			setUserEmail(result.email);

			// Initial sync after registration
			setIsSyncing(true);
			await fullSync();
			setLastSynced(Date.now());
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Registration failed";
			setSyncError(msg);
			throw err;
		} finally {
			setIsSyncing(false);
		}
	}, []);

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
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Sync failed";
			setSyncError(msg);
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
		login,
		register,
		logout,
		syncNow,
	};

	return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
};
