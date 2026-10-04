import { App as CapacitorApp } from "@capacitor/app";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { log } from "../../utils/log";
import { pushPermissionKey } from "../db/hooks/query-keys";
import { getPushPermission, isPushSupported, wasPushPermissionAsked } from "./index";

let isOfferOpen = false;
const listeners = new Set<() => void>();

function setOfferOpen(value: boolean): void {
	isOfferOpen = value;
	for (const listener of listeners) listener();
}

/**
 * The moment notifications start to matter: the first new friend, by a sent or
 * accepted request or a redeemed invite. Offered once; a device that was asked
 * before, or decided in system settings, is left alone. Never rejects.
 */
export async function offerPushAfterFriendship(): Promise<void> {
	try {
		if (await wasPushPermissionAsked()) return;
		if ((await getPushPermission()) !== "prompt") return;
		setOfferOpen(true);
	} catch (err) {
		log.warn("push", "notification offer failed:", err);
	}
}

/** For an "Enable notifications" row the user tapped. */
export function openPushOffer(): void {
	setOfferOpen(true);
}

export function closePushOffer(): void {
	setOfferOpen(false);
}

export function usePushOfferOpen(): boolean {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		() => isOfferOpen,
	);
}

/** Re-read on resume: the user may have just changed it in system settings. */
export function usePushPermission() {
	const client = useQueryClient();
	const isSupported = isPushSupported();
	useEffect(() => {
		if (!isSupported) return;
		const handle = CapacitorApp.addListener("resume", () => {
			void client.invalidateQueries({ queryKey: pushPermissionKey });
		});
		return () => {
			void handle.then((h) => h.remove());
		};
	}, [client, isSupported]);
	return useQuery({ queryKey: pushPermissionKey, queryFn: getPushPermission, staleTime: 0 });
}
