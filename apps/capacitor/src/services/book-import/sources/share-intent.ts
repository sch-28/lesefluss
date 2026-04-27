import { type PluginListenerHandle, registerPlugin } from "@capacitor/core";

export type ShareReceivedEvent =
	| { kind?: "text"; text: string; subject?: string }
	| { kind: "file"; path: string; fileName: string; mimeType?: string };

interface ShareIntentPlugin {
	addListener(
		event: "shareReceived",
		cb: (data: ShareReceivedEvent) => void,
	): Promise<PluginListenerHandle>;
}

const ShareIntent = registerPlugin<ShareIntentPlugin>("ShareIntent");

/**
 * Subscribe to Android share/open-with intents. Two payload shapes:
 *   - text: ACTION_SEND with text/* — shared URLs or plain text.
 *   - file: ACTION_VIEW or ACTION_SEND with a binary mime type — the native
 *     plugin has already copied the stream into app cache and provides an
 *     absolute path readable via Capacitor Filesystem.
 *
 * The plugin retains the most recent event, so a listener registered after a
 * cold-start share still receives it.
 *
 * Returns a handle; call `.remove()` to unsubscribe.
 */
export async function subscribeShareIntent(
	handler: (payload: ShareReceivedEvent) => void,
): Promise<PluginListenerHandle> {
	return ShareIntent.addListener("shareReceived", handler);
}
