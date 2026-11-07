import { App as CapacitorApp } from "@capacitor/app";
import { consumeBackPress } from "@lesefluss/ui/overlay-back";
import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

export function HardwareBack() {
	const router = useRouter();
	useEffect(() => {
		const handlePromise = CapacitorApp.addListener("backButton", () => {
			// An open overlay takes the press first: otherwise back moves the page
			// behind it.
			if (consumeBackPress()) return;
			// Not window.history.length: it never shrinks, so after any replace (an
			// auto-opened book replaces "/" with the library) back never reached exit.
			if (router.history.canGoBack()) {
				router.history.back();
			} else {
				CapacitorApp.exitApp();
			}
		});
		return () => {
			handlePromise.then((h) => h.remove());
		};
	}, [router]);
	return null;
}
