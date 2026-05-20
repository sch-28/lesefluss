import { App as CapacitorApp } from "@capacitor/app";
import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

export function HardwareBack() {
	const router = useRouter();
	useEffect(() => {
		const handlePromise = CapacitorApp.addListener("backButton", () => {
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
