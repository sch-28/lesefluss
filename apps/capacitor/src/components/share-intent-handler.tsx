import type { PluginListenerHandle } from "@capacitor/core";
import { Filesystem } from "@capacitor/filesystem";
import {
	base64ToArrayBuffer,
	extractEmbeddedUrl,
	isLikelyUrl,
	normalizeUrl,
} from "@lesefluss/book-import";
import type React from "react";
import { useEffect, useRef } from "react";
import { useHistory } from "react-router-dom";
import { subscribeShareIntent } from "../services/book-import/sources/share-intent";
import { queryHooks } from "../services/db/hooks";
import { isSerialUrl } from "../services/serial-scrapers";
import { log } from "../utils/log";
import { IS_WEB } from "../utils/platform";
import { useToast } from "./toast";

/**
 * Listens for Android intents (ACTION_SEND share-sheet, ACTION_VIEW "Open
 * with") and routes the payload to the appropriate import:
 *   - file payload     → read cache copy via Filesystem → Blob → blob importer
 *   - URL-shaped text  → URL importer (fetch + Readability via catalog proxy)
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
	const importSerial = queryHooks.useImportSerialFromUrl();
	const importText = queryHooks.useImportBookFromText();
	const importBlob = queryHooks.useImportBookFromBlob();
	const { showToast } = useToast();
	const history = useHistory();

	const handlersRef = useRef({
		importUrl,
		importSerial,
		importText,
		importBlob,
		showToast,
		history,
	});
	handlersRef.current = { importUrl, importSerial, importText, importBlob, showToast, history };

	useEffect(() => {
		if (IS_WEB) return;

		let handle: PluginListenerHandle | null = null;
		let cancelled = false;

		(async () => {
			try {
				handle = await subscribeShareIntent((event) => {
					const { importUrl, importSerial, importText, importBlob, showToast, history } =
						handlersRef.current;

					// Any incoming intent jumps to the library tab so the user sees
					// the import land. The library route handles the redirect from
					// onboarding / reader / settings tabs.
					if (!history.location.pathname.startsWith("/tabs/library")) {
						history.push("/tabs/library");
					}

					if (event.kind === "file") {
						handleSharedFile(event.path, event.fileName, event.mimeType, importBlob, showToast);
						return;
					}

					const trimmed = event.text.trim();
					if (!trimmed) return;
					const candidate = normalizeUrl(trimmed);

					if (isLikelyUrl(candidate)) {
						if (isSerialUrl(candidate)) {
							importSerial.mutate(
								{ url: candidate },
								{
									onSuccess: (s) => showToast(`Imported series: ${s.title}`),
									onError: () => showToast("Couldn't import shared series", "danger"),
								},
							);
							return;
						}
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
						// Mixed text like "Article title https://share.google/xyz" — extract
						// the embedded URL and import the article rather than the raw text.
						const embeddedUrl = extractEmbeddedUrl(trimmed);
						if (embeddedUrl) {
							if (isSerialUrl(embeddedUrl)) {
								importSerial.mutate(
									{ url: embeddedUrl },
									{
										onSuccess: (s) => showToast(`Imported series: ${s.title}`),
										onError: () => showToast("Couldn't import shared series", "danger"),
									},
								);
							} else {
								importUrl.mutate(
									{ url: embeddedUrl },
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
							}
						} else {
							importText.mutate(
								{ text: trimmed, hint: event.subject ? { title: event.subject } : undefined },
								{
									onSuccess: (book) => showToast(`Imported: ${book.title}`),
									onError: () => showToast("Couldn't import shared text", "danger"),
								},
							);
						}
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

type ImportBlobMutation = ReturnType<typeof queryHooks.useImportBookFromBlob>;
type ShowToast = ReturnType<typeof useToast>["showToast"];

function handleSharedFile(
	path: string,
	fileName: string,
	mimeType: string | undefined,
	importBlob: ImportBlobMutation,
	showToast: ShowToast,
): void {
	void (async () => {
		let blob: Blob;
		try {
			const { data } = await Filesystem.readFile({ path });
			if (typeof data !== "string") {
				showToast("Couldn't read shared file", "danger");
				return;
			}
			blob = new Blob([base64ToArrayBuffer(data)], mimeType ? { type: mimeType } : undefined);
		} catch (err) {
			log.warn("share-intent", "readFile failed:", err);
			showToast("Couldn't read shared file", "danger");
			return;
		}

		importBlob.mutate(
			{ blob, fileName },
			{
				onSuccess: (book) => showToast(`Imported: ${book.title}`),
				onError: () => showToast("Couldn't import shared file", "danger"),
				onSettled: () => {
					Filesystem.deleteFile({ path }).catch((err) =>
						log.warn("share-intent", "deleteFile failed:", err),
					);
				},
			},
		);
	})();
}

export default ShareIntentHandler;
