import { App as CapacitorApp } from "@capacitor/app";
import { consumeBackPress } from "@lesefluss/ui/overlay-back";
import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { resolveBack } from "./resolve-back";

export function HardwareBack() {
	const router = useRouter();
	useEffect(() => {
		const handlePromise = CapacitorApp.addListener("backButton", () => {
			// An open overlay or a mode (Select, an expanded card) takes the press
			// first: otherwise back moves the page behind it.
			if (consumeBackPress()) return;
			const { history } = router;
			// Not window.history.length: it never shrinks, so after any replace (an
			// auto-opened book replaces "/" with the library) back never reached exit.
			const action = resolveBack(
				history.location.pathname,
				history.location.search,
				history.canGoBack(),
			);
			if (action.kind === "back") history.back();
			else if (action.kind === "replace") history.replace(action.to);
			else CapacitorApp.exitApp();
		});
		return () => {
			handlePromise.then((h) => h.remove());
		};
	}, [router]);
	return null;
}
