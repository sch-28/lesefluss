import { Capacitor } from "@capacitor/core";
import { Network } from "@capacitor/network";
import { useSyncExternalStore } from "react";

/**
 * Counts offline→online transitions, from one listener for the whole app.
 * Components that gave up while offline (a cover that failed to load) key a
 * retry on it instead of each subscribing to the Network plugin.
 */
let epoch = 0;
let isOnline = true;
const listeners = new Set<() => void>();
let started = false;

function setOnline(next: boolean) {
	if (next && !isOnline) {
		epoch++;
		for (const l of listeners) l();
	}
	isOnline = next;
}

function start() {
	if (started || typeof window === "undefined") return;
	started = true;
	if (Capacitor.isNativePlatform()) {
		// An Android WebView keeps navigator.onLine true in airplane mode.
		void Network.addListener("networkStatusChange", (s) => setOnline(s.connected));
	} else {
		window.addEventListener("online", () => setOnline(true));
		window.addEventListener("offline", () => setOnline(false));
	}
}

function subscribe(listener: () => void) {
	start();
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function useReconnectEpoch(): number {
	return useSyncExternalStore(
		subscribe,
		() => epoch,
		() => 0,
	);
}
