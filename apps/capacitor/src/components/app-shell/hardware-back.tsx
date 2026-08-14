import { App as CapacitorApp } from "@capacitor/app";
import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { consumeBackPress } from "../../services/overlay-back";

export function HardwareBack() {
	const router = useRouter();
	useEffect(() => {
		const handlePromise = CapacitorApp.addListener("backButton", () => {
			// A drawer mounted outside the router survives navigation, so it has to
			// take the press first: otherwise back moves the page behind it.
			if (consumeBackPress()) return;
			if (window.history.length > 1) {
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
