import { Capacitor } from "@capacitor/core";
import { useMemo, useState } from "react";
import { useToast } from "../../components/toast";
import { useImportStaging } from "../../contexts/import-staging-context";
import type { StagedImport } from "../../services/book-import";
import { queryHooks } from "../../services/db/hooks";
import { isSerialUrl } from "../../services/serial-scrapers";
import { ALERT_SUPPRESSED, ERROR_TOASTS, urlImportErrorText } from "./import-errors";

type UseLibraryImports = {
	/** True while any import (file/clipboard/URL) is running. */
	isImporting: boolean;
	/** Current parser progress (0–100); 0 when not applicable. */
	progress: number;
	/** URL-import pending state, surfaced separately for the modal button. */
	isUrlImporting: boolean;
	/** Message for the file and clipboard import alert, or null. */
	errorMessage: string | null;
	/** Why the last URL import failed, shown in the URL dialog; null when it did not. */
	urlError: string | null;
	clearUrlError: () => void;
	/** Clear error state on all import mutations. */
	resetError: () => void;
	/** Run the OS file picker → parse flow, then queue the result. */
	importFromFile: () => void;
	/** Read the clipboard → import. On the web an empty or blocked clipboard opens `pasteTextOpen` instead. */
	importFromClipboard: () => void;
	/** The text box the web falls back to when it can't read the clipboard. */
	pasteTextOpen: boolean;
	closePasteText: () => void;
	/** Import typed or pasted text. Closes the text box on success. */
	importFromText: (text: string) => void;
	/** Fetch + extract a URL via the proxy → import. Closes the modal on success; a failure sets `urlError`. */
	importFromUrl: (url: string, opts?: { onSuccess?: () => void }) => void;
};

/**
 * Consolidates every library import mutation into a single hook so the
 * library page stays focused on rendering. New sources (Calibre, future
 * PDF-by-URL, …) should grow this hook rather than the page component.
 * Error-to-toast mapping is global (see `ERROR_TOASTS`) — any code path
 * that throws a known code gets the same UX, regardless of which mutation
 * surfaced it.
 *
 * A book imported while `targetCollectionId` is set joins that collection.
 * Serials are not books and stay out of it.
 */
export function useLibraryImports(targetCollectionId?: string): UseLibraryImports {
	const importFile = queryHooks.useImportBook();
	const importClipboard = queryHooks.useImportBookFromClipboard();
	const importText = queryHooks.useImportBookFromText();
	const importUrl = queryHooks.useImportBookFromUrl();
	const importSerial = queryHooks.useImportSerialFromUrl();
	const { showToast } = useToast();
	const { stage } = useImportStaging();

	const [progress, setProgress] = useState(0);
	const [urlError, setUrlError] = useState<string | null>(null);
	const [pasteTextOpen, setPasteTextOpen] = useState(false);

	/**
	 * Surface a failed import and decide whether its error may linger.
	 *
	 * `errorMessage` reads the first non-null error across the file and clipboard mutations, so
	 * an error that never opens the alert would mask every later one that should:
	 * cancel the file picker once and a subsequent failed clipboard import shows
	 * nothing. Anything already surfaced (toast) or deliberately silent (cancel)
	 * is therefore cleared here; only alert-worthy errors are kept for rendering.
	 */
	const handleImportError = (mutation: { reset: () => void }, err: unknown): void => {
		if (!(err instanceof Error)) return;
		const entry = ERROR_TOASTS[err.message];
		if (entry) showToast(entry.msg, entry.color);
		if (ALERT_SUPPRESSED.has(err.message)) mutation.reset();
	};

	const errorMessage = useMemo(() => {
		const err = importFile.error ?? importClipboard.error ?? importText.error;
		if (!(err instanceof Error)) return null;
		if (ALERT_SUPPRESSED.has(err.message)) return null;
		return err.message;
	}, [importFile.error, importClipboard.error, importText.error]);

	/**
	 * Park a parsed book in the confirm queue, or surface why it never got there.
	 *
	 * `mutateAsync` rather than a per-call `onSuccess`: starting a second import
	 * while one is parsing detaches the first mutation's observer, so its per-call
	 * callbacks never fire, while the promise returned here still resolves.
	 *
	 * `reset()` on success drops the payload react-query would otherwise keep in
	 * `mutation.data` for the rest of the session. On failure it is left to
	 * `handleImportError`, because resetting an alert-worthy error here would
	 * clear it before React renders it and the "Import failed" alert would never
	 * open.
	 */
	const stageFrom = async <V>(
		mutation: { mutateAsync: (vars: V) => Promise<StagedImport>; reset: () => void },
		vars: V,
	): Promise<boolean> => {
		try {
			const staged = await mutation.mutateAsync(vars);
			stage(targetCollectionId ? { ...staged, targetCollectionId } : staged);
			mutation.reset();
			return true;
		} catch (err) {
			handleImportError(mutation, err);
			return false;
		}
	};

	return {
		isImporting:
			importFile.isPending ||
			importClipboard.isPending ||
			importText.isPending ||
			importUrl.isPending ||
			importSerial.isPending,
		progress,
		isUrlImporting: importUrl.isPending || importSerial.isPending,
		errorMessage,
		urlError,
		clearUrlError: () => setUrlError(null),
		resetError: () => {
			importFile.reset();
			importClipboard.reset();
			importText.reset();
		},
		importFromFile: async () => {
			setProgress(0);
			await stageFrom(importFile, { onProgress: setProgress });
			setProgress(0);
		},
		importFromClipboard: async () => {
			try {
				const staged = await importClipboard.mutateAsync();
				stage(targetCollectionId ? { ...staged, targetCollectionId } : staged);
				importClipboard.reset();
			} catch (err) {
				// A browser may refuse the clipboard without asking; a text box still works there.
				if (err instanceof Error && err.message === "EMPTY" && !Capacitor.isNativePlatform()) {
					importClipboard.reset();
					setPasteTextOpen(true);
					return;
				}
				handleImportError(importClipboard, err);
			}
		},
		pasteTextOpen,
		closePasteText: () => setPasteTextOpen(false),
		importFromText: async (text) => {
			if (await stageFrom(importText, { text })) setPasteTextOpen(false);
		},
		importFromUrl: async (url, opts) => {
			setUrlError(null);
			// Route serial/web-novel URLs (AO3, ScribbleHub, …) to the scraper
			// pipeline; everything else goes through the standard URL importer.
			const isSerial = isSerialUrl(url);
			const mutation = isSerial ? importSerial : importUrl;
			try {
				if (isSerial) {
					await importSerial.mutateAsync({ url });
				} else {
					const staged = await importUrl.mutateAsync({ url });
					stage(targetCollectionId ? { ...staged, targetCollectionId } : staged);
				}
				mutation.reset();
				opts?.onSuccess?.();
			} catch (err) {
				// The dialog shows it; a kept mutation error would only resurface elsewhere.
				mutation.reset();
				setUrlError(urlImportErrorText(err));
			}
		},
	};
}
