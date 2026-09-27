import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { socialKeys } from "../db/hooks/query-keys";
import { queryClient } from "../query-client";

/**
 * Social data lives on the server, unlike the SQLite-backed queries the shared
 * client defaults were written for: it goes stale on its own and a failed
 * request may just be a dead connection.
 */
export const socialQueryDefaults = {
	staleTime: 30_000,
	gcTime: 24 * 60 * 60_000,
	retry: 1,
	refetchOnWindowFocus: true,
	refetchOnMount: "always",
} as const;

/** Drops every social query. Called on sign-out and on an account switch. */
export function clearSocialQueries(): void {
	queryClient.removeQueries({ queryKey: socialKeys.all });
}

/** After a sync run: the server may hold new items for this account. */
export function invalidateUnreadCount(): void {
	void queryClient.invalidateQueries({ queryKey: socialKeys.unread });
}

/** Refetches social queries when the app comes back to the foreground. */
export function useRefetchSocialOnForeground(): void {
	const client = useQueryClient();
	useEffect(() => {
		const refetch = () => void client.invalidateQueries({ queryKey: socialKeys.all });
		const onVisible = () => {
			if (document.visibilityState === "visible") refetch();
		};
		document.addEventListener("visibilitychange", onVisible);
		const handle = Capacitor.isNativePlatform()
			? CapacitorApp.addListener("resume", refetch)
			: null;
		return () => {
			document.removeEventListener("visibilitychange", onVisible);
			handle?.then((h) => h.remove());
		};
	}, [client]);
}

export function useIsOnline(): boolean {
	const [isOnline, setIsOnline] = useState(() =>
		typeof navigator === "undefined" ? true : navigator.onLine,
	);
	useEffect(() => {
		const update = () => setIsOnline(navigator.onLine);
		window.addEventListener("online", update);
		window.addEventListener("offline", update);
		return () => {
			window.removeEventListener("online", update);
			window.removeEventListener("offline", update);
		};
	}, [setIsOnline]);
	return isOnline;
}
