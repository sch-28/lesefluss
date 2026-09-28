import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { type AnyRouter, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { log } from "../../utils/log";
import { queries } from "../db/queries";
import { parseDeepLink } from "./parse";
import { type PendingLink, setPendingLink, takePendingLink } from "./pending-link";

/** Navigates to a link's screen. A cold start has no history, so the Social tab is put underneath first. */
export function navigateToLink(router: AnyRouter, link: PendingLink): void {
	if (window.history.length <= 1) {
		router.navigate({ to: "/tabs/social", replace: true });
	}
	router.navigate({ to: "/tabs/social/invite/$token", params: { token: link.token } });
}

/** Replays a stored link, if any. Returns whether one was found. */
export async function replayPendingLink(router: AnyRouter): Promise<boolean> {
	const link = await takePendingLink();
	if (!link) return false;
	navigateToLink(router, link);
	return true;
}

/** Cold-start `getLaunchUrl` and the first `appUrlOpen` can deliver one launch twice, a moment apart. */
const DUPLICATE_DELIVERY_WINDOW_MS = 2_000;

export type DeepLinkHandlerDeps = {
	router: AnyRouter;
	isOnboardingCompleted: () => Promise<boolean>;
	openInBrowser: (url: string) => Promise<void>;
	now?: () => number;
};

/**
 * Turns an incoming URL into navigation. Pure apart from its deps, so the
 * decisions (ignore, browser, onboarding gate, navigate) are unit-testable
 * without Capacitor. Tokens are never logged.
 */
export function createDeepLinkHandler(deps: DeepLinkHandlerDeps): (url: string) => Promise<void> {
	const now = deps.now ?? Date.now;
	let lastDelivery: { url: string; at: number } | null = null;
	return async (url: string) => {
		const at = now();
		if (lastDelivery?.url === url && at - lastDelivery.at < DUPLICATE_DELIVERY_WINDOW_MS) return;
		lastDelivery = { url, at };
		// The custom-scheme auth callback has its own listener.
		if (!url.startsWith("https://")) return;
		const parsed = parseDeepLink(url);
		if (!parsed) return;
		if (parsed.kind === "unknown-claimed") {
			await deps.openInBrowser(parsed.url).catch(() => {});
			return;
		}
		const link: PendingLink = { kind: "invite", token: parsed.token };
		if (!(await deps.isOnboardingCompleted())) {
			// Replayed once onboarding finishes.
			await setPendingLink(link);
			deps.router.navigate({ to: "/onboarding", replace: true });
			return;
		}
		navigateToLink(deps.router, link);
	};
}

/** The one listener for https App Links, mounted at the root on native. */
export function useDeepLinks(): void {
	const router = useRouter();
	const handleUrl = useMemo(
		() =>
			createDeepLinkHandler({
				router,
				isOnboardingCompleted: async () => (await queries.getSettings()).onboardingCompleted,
				openInBrowser: (url) => Browser.open({ url }),
			}),
		[router],
	);

	useEffect(() => {
		if (!Capacitor.isNativePlatform()) return;
		let cancelled = false;
		const handlePromise = CapacitorApp.addListener("appUrlOpen", ({ url }) => void handleUrl(url));
		CapacitorApp.getLaunchUrl()
			.then((result) => {
				if (!cancelled && result?.url) void handleUrl(result.url);
			})
			.catch((err) => log.warn("deep-links", "getLaunchUrl failed:", err));
		return () => {
			cancelled = true;
			handlePromise.then((h) => h.remove());
		};
	}, [handleUrl]);
}
