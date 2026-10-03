import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useEffect, useState } from "react";

/** Foreground as either platform reports it: the web build has no app state, native WebViews may keep "visible". */
export function useIsForeground(): boolean {
	const [isForeground, setIsForeground] = useState(() => document.visibilityState === "visible");
	useEffect(() => {
		const onVisibility = () => setIsForeground(document.visibilityState === "visible");
		document.addEventListener("visibilitychange", onVisibility);
		const handle = Capacitor.isNativePlatform()
			? CapacitorApp.addListener("appStateChange", ({ isActive }) => setIsForeground(isActive))
			: null;
		return () => {
			document.removeEventListener("visibilitychange", onVisibility);
			handle?.then((h) => h.remove());
		};
	}, []);
	return isForeground;
}
