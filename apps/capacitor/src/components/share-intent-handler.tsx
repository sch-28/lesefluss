import type { PluginListenerHandle } from "@capacitor/core";
import type React from "react";
import { useEffect, useRef } from "react";
import { subscribeShareIntent } from "../services/book-import/sources/share-intent";
import { isLikelyUrl, normalizeUrl } from "../services/book-import/utils/url-guards";
import { queryHooks } from "../services/db/hooks";
import { log } from "../utils/log";
import { IS_WEB } from "../utils/platform";
import { useToast } from "./toast";

/**
 * Listens for Android share intents and routes them to the appropriate import:
 *   - URL-shaped text → URL importer (fetch + Readability via catalog proxy)
 *   - anything else    → plain-text importer
 *
 * The effect subscribes exactly once on mount. Handlers that depend on
 * non-stable references (the toast callback, react-query mutation objects)
 * are read through a ref so the listener never needs to be torn down and
 * recreated — the native plugin uses a retain flag to deliver cold-start
 * share events to the first listener, so churning the listener would drop
 * those events or deliver them to a stale handler.
 */
const ShareIntentHandler: React.FC = () => {
	const importUrl = queryHooks.useImportBookFromUrl();
	const importText = queryHooks.useImportBookFromText();
	const { showToast } = useToast();

	const handlersRef = useRef({ importUrl, importText, showToast });
	handlersRef.current = { importUrl, importText, showToast };

	useEffect(() => {
		if (IS_WEB) return;

		let handle: PluginListenerHandle | null = null;
		let cancelled = false;

		(async () => {
			try {
				handle = await subscribeShareIntent(({ text, subject }) => {
					const trimmed = text.trim();
					if (!trimmed) return;

					const { importUrl, importText, showToast } = handlersRef.current;
					const candidate = normalizeUrl(trimmed);

					if (isLikelyUrl(candidate)) {
						importUrl.mutate(
							{ url: candidate },
							{
								onSuccess: (book) => showToast(`Imported: ${book.title}`),
								onError: (err: Error) => {
									if (err.message === "TOO_LARGE") {
										showToast("Shared page too large", "warning");
									} else {
										showToast("Couldn't import shared link", "danger");
									}
								},
							},
						);
					} else {
						importText.mutate(
							{ text: trimmed, hint: subject ? { title: subject } : undefined },
							{
								onSuccess: (book) => showToast(`Imported: ${book.title}`),
								onError: () => showToast("Couldn't import shared text", "danger"),
							},
						);
					}
				});
			} catch (err) {
				log.warn("share-intent", "subscribe failed:", err);
			}
			// The component unmounted while we were awaiting the subscription.
			if (cancelled) handle?.remove();
		})();

		return () => {
			cancelled = true;
			handle?.remove();
		};
	}, []);

	return null;
};

export default ShareIntentHandler;
