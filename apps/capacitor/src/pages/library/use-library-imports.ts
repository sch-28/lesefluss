import { useMemo, useState } from "react";
import { useToast } from "../../components/toast";
import { useImportStaging } from "../../contexts/import-staging-context";
import type { StagedImport } from "../../services/book-import";
import { queryHooks } from "../../services/db/hooks";
import { isSerialUrl } from "../../services/serial-scrapers";
import { ALERT_SUPPRESSED, ERROR_TOASTS } from "./import-errors";

type UseLibraryImports = {
	/** True while any import (file/clipboard/URL) is running. */
	isImporting: boolean;
	/** Current parser progress (0–100); 0 when not applicable. */
	progress: number;
	/** URL-import pending state, surfaced separately for the modal button. */
	isUrlImporting: boolean;
	/** Message for the generic "Import Failed" alert, or null. */
	errorMessage: string | null;
	/** Clear error state on all import mutations. */
	resetError: () => void;
	/** Run the OS file picker → parse flow, then queue the result. */
	importFromFile: () => void;
	/** Read the clipboard → import. */
	importFromClipboard: () => void;
	/** Fetch + extract a URL via the proxy → import. Closes the modal on success. */
	importFromUrl: (url: string, opts?: { onSuccess?: () => void }) => void;
};

/**
 * Consolidates every library import mutation into a single hook so the
 * library page stays focused on rendering. New sources (Calibre, future
 * PDF-by-URL, …) should grow this hook rather than the page component.
 * Error-to-toast mapping is global (see `ERROR_TOASTS`) — any code path
 * that throws a known code gets the same UX, regardless of which mutation
 * surfaced it.
 */
export function useLibraryImports(): UseLibraryImports {
	const importFile = queryHooks.useImportBook();
	const importClipboard = queryHooks.useImportBookFromClipboard();
	const importUrl = queryHooks.useImportBookFromUrl();
	const importSerial = queryHooks.useImportSerialFromUrl();
	const { showToast } = useToast();
	const { stage } = useImportStaging();

	const [progress, setProgress] = useState(0);

	/**
	 * Surface a failed import and decide whether its error may linger.
	 *
	 * `errorMessage` reads the first non-null error across the four mutations, so
	 * an error that never opens the alert would mask every later one that should:
	 * cancel the file picker once and a subsequent offline URL import fails
	 * silently. Anything already surfaced (toast) or deliberately silent (cancel)
	 * is therefore cleared here; only alert-worthy errors are kept for rendering.
	 */
	const handleImportError = (mutation: { reset: () => void }, err: unknown): void => {
		if (!(err instanceof Error)) return;
		const entry = ERROR_TOASTS[err.message];
		if (entry) showToast(entry.msg, entry.color);
		if (ALERT_SUPPRESSED.has(err.message)) mutation.reset();
	};

	const errorMessage = useMemo(() => {
		const err = importFile.error ?? importClipboard.error ?? importUrl.error ?? importSerial.error;
		if (!(err instanceof Error)) return null;
		if (ALERT_SUPPRESSED.has(err.message)) return null;
		if (err.message === "FETCH_FAILED") return "Couldn't load this page.";
		return err.message;
	}, [importFile.error, importClipboard.error, importUrl.error, importSerial.error]);

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
	 * clear it before React renders it and the "Import Failed" alert would never
	 * open.
	 */
	const stageFrom = async <V>(
		mutation: { mutateAsync: (vars: V) => Promise<StagedImport>; reset: () => void },
		vars: V,
	): Promise<boolean> => {
		try {
			stage(await mutation.mutateAsync(vars));
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
			importUrl.isPending ||
			importSerial.isPending,
		progress,
		isUrlImporting: importUrl.isPending || importSerial.isPending,
		errorMessage,
		resetError: () => {
			importFile.reset();
			importClipboard.reset();
			importUrl.reset();
			importSerial.reset();
		},
		importFromFile: async () => {
			setProgress(0);
			await stageFrom(importFile, { onProgress: setProgress });
			setProgress(0);
		},
		importFromClipboard: () => stageFrom(importClipboard, undefined),
		importFromUrl: async (url, opts) => {
			// Route serial/web-novel URLs (AO3, ScribbleHub, …) to the scraper
			// pipeline; everything else goes through the standard URL importer.
			if (isSerialUrl(url)) {
				importSerial.mutate(
					{ url },
					{
						onSuccess: () => opts?.onSuccess?.(),
						onError: (err) => handleImportError(importSerial, err),
					},
				);
				return;
			}
			if (await stageFrom(importUrl, { url })) opts?.onSuccess?.();
		},
	};
}
