import { useMemo, useState } from "react";
import { useToast } from "../../components/toast";
import { queryHooks } from "../../services/db/hooks";
import { isSerialUrl } from "../../services/serial-scrapers";

/**
 * Error codes thrown by any source/parser in the book-import subsystem and
 * how the UI should react to each. Source-agnostic: a `PDF_ENCRYPTED` thrown
 * from the file picker, a catalog import, or a future URL→PDF path all
 * produce the same toast.
 *
 * - `color: "warning"` for expected user states (no input, unsupported
 *   format variant, input rejected by a guard).
 * - Codes not listed here fall through to the generic "Import Failed" alert.
 */
const ERROR_TOASTS: Record<string, { msg: string; color: "warning" | "danger" }> = {
	EMPTY: { msg: "Nothing to paste", color: "warning" },
	INVALID_URL: { msg: "That doesn't look like a URL", color: "warning" },
	TOO_LARGE: { msg: "Page too large to import", color: "warning" },
	PDF_ENCRYPTED: { msg: "Password-protected PDFs aren't supported", color: "warning" },
	PDF_NO_TEXT: { msg: "This PDF has no selectable text", color: "warning" },
};

/**
 * Codes that the UI handles without surfacing an alert — either because
 * they represent a user action (cancel) or because they fire a toast via
 * `ERROR_TOASTS` instead. `FETCH_FAILED` still raises the alert (with a
 * friendlier message); everything else unknown also raises it verbatim.
 */
const ALERT_SUPPRESSED: ReadonlySet<string> = new Set(["CANCELLED", ...Object.keys(ERROR_TOASTS)]);

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
	/** Run the OS file picker → import flow. */
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

	const [progress, setProgress] = useState(0);

	const toastForKnownError = (err: Error): void => {
		const entry = ERROR_TOASTS[err.message];
		if (entry) showToast(entry.msg, entry.color);
	};

	const errorMessage = useMemo(() => {
		const err = importFile.error ?? importClipboard.error ?? importUrl.error ?? importSerial.error;
		if (!(err instanceof Error)) return null;
		if (ALERT_SUPPRESSED.has(err.message)) return null;
		if (err.message === "FETCH_FAILED") return "Couldn't load this page.";
		return err.message;
	}, [importFile.error, importClipboard.error, importUrl.error, importSerial.error]);

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
		importFromFile: () => {
			setProgress(0);
			importFile.mutate(
				{ onProgress: setProgress },
				{ onSettled: () => setProgress(0), onError: toastForKnownError },
			);
		},
		importFromClipboard: () => {
			importClipboard.mutate(undefined, { onError: toastForKnownError });
		},
		importFromUrl: (url, opts) => {
			// Route serial/web-novel URLs (AO3, ScribbleHub, …) to the scraper
			// pipeline; everything else goes through the standard URL importer.
			if (isSerialUrl(url)) {
				importSerial.mutate(
					{ url },
					{
						onSuccess: () => opts?.onSuccess?.(),
						onError: toastForKnownError,
					},
				);
				return;
			}
			importUrl.mutate(
				{ url },
				{
					onSuccess: () => opts?.onSuccess?.(),
					onError: toastForKnownError,
				},
			);
		},
	};
}
