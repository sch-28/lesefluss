import { type PluginListenerHandle, registerPlugin } from "@capacitor/core";

type ShareReceivedEvent = {
	text: string;
	subject?: string;
};

interface ShareIntentPlugin {
	addListener(
		event: "shareReceived",
		cb: (data: ShareReceivedEvent) => void,
	): Promise<PluginListenerHandle>;
}

const ShareIntent = registerPlugin<ShareIntentPlugin>("ShareIntent");

/**
 * Subscribe to Android share intents (ACTION_SEND with text/plain). The plugin
 * retains the most recent event, so a listener registered after a cold-start
 * share still receives it.
 *
 * Returns a handle; call `.remove()` to unsubscribe.
 */
export async function subscribeShareIntent(
	handler: (payload: ShareReceivedEvent) => void,
): Promise<PluginListenerHandle> {
	return ShareIntent.addListener("shareReceived", handler);
}
