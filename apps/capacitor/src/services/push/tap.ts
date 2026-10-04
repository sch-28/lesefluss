import { isPushUuid, type PushLink, parsePushRoute } from "@lesefluss/core";
import type { AnyRouter } from "@tanstack/react-router";
import { log } from "../../utils/log";
import { setPendingLink } from "../deep-links/pending-link";
import { navigateToLink, withGoneBuddyReadFallback } from "../deep-links/use-deep-links";

export type PushTarget = { link: PushLink; inboxItemId: string | null };

/** Only a route the server could have built is accepted; anything else in a payload is never navigated to. */
export function parsePushTarget(data: unknown): PushTarget | null {
	if (typeof data !== "object" || data === null) return null;
	const { route, inboxItemId } = data as Record<string, unknown>;
	const link = typeof route === "string" ? parsePushRoute(route) : null;
	if (!link) return null;
	const itemId = typeof inboxItemId === "string" && isPushUuid(inboxItemId) ? inboxItemId : null;
	return { link, inboxItemId: itemId };
}

export type PushTapDeps = {
	router: AnyRouter;
	isSignedIn: () => Promise<boolean>;
	isOnboardingCompleted: () => Promise<boolean>;
	markRead: (inboxItemId: string) => Promise<unknown>;
	buddyReadExists: (buddyReadId: string) => Promise<boolean>;
};

/**
 * Opens the screen behind a tapped notification. A tap that cannot be honoured
 * still lands somewhere useful: the Social tab when signed out, the inbox when
 * the buddy read is gone.
 */
export async function openPushTarget(deps: PushTapDeps, data: unknown): Promise<void> {
	const target = parsePushTarget(data);
	if (!target || !(await deps.isSignedIn())) {
		await deps.router.navigate({ to: "/tabs/social" });
		return;
	}
	if (target.inboxItemId) {
		deps.markRead(target.inboxItemId).catch((err) => log.warn("push", "mark read failed:", err));
	}
	if (!(await deps.isOnboardingCompleted())) {
		await setPendingLink(target.link);
		await deps.router.navigate({ to: "/onboarding", replace: true });
		return;
	}
	await navigateToLink(
		deps.router,
		await withGoneBuddyReadFallback(target.link, deps.buddyReadExists),
	);
}
