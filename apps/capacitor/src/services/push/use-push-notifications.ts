import type { PluginListenerHandle } from "@capacitor/core";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { log } from "../../utils/log";
import { queries } from "../db/queries";
import { markPushListenersAttached, markPushTapReceived } from "../launch-intent";
import { buddyReadExists } from "../social/buddy-reads";
import { invalidateInbox } from "../social/cache";
import { inboxClient } from "../social/inbox";
import { getToken } from "../sync/session";
import { isPushSupported, loadPluginModule } from "./index";
import { openPushTarget, type PushTapDeps } from "./tap";

/**
 * Taps and foreground deliveries, mounted at the root. The plugin holds a tap
 * that launched the app until a listener is added, so cold-start taps arrive
 * here too.
 */
export function usePushNotifications(): void {
	const router = useRouter();
	const deps = useMemo<PushTapDeps>(
		() => ({
			router,
			isSignedIn: async () => Boolean(await getToken()),
			isOnboardingCompleted: async () => (await queries.getSettings()).onboardingCompleted,
			markRead: async (id) => {
				await inboxClient.markRead(id);
				invalidateInbox();
			},
			buddyReadExists,
		}),
		[router],
	);

	useEffect(() => {
		if (!isPushSupported()) {
			markPushListenersAttached();
			return;
		}
		let isCancelled = false;
		const handles: PluginListenerHandle[] = [];
		const keep = (handle: PluginListenerHandle) => {
			if (isCancelled) void handle.remove();
			else handles.push(handle);
		};
		(async () => {
			const { PushNotifications: push } = await loadPluginModule();
			keep(
				await push.addListener("pushNotificationActionPerformed", ({ notification }) => {
					markPushTapReceived();
					openPushTarget(deps, notification.data).catch((err) =>
						log.warn("push", "opening a notification failed:", err),
					);
				}),
			);
			// Android shows nothing while the app is open, so the inbox has to catch up by itself.
			keep(await push.addListener("pushNotificationReceived", invalidateInbox));
		})()
			.catch((err) => log.warn("push", "listener setup failed:", err))
			.finally(markPushListenersAttached);
		return () => {
			isCancelled = true;
			for (const handle of handles) void handle.remove();
		};
	}, [deps]);
}
