/**
 * Error codes thrown by any source/parser in the book-import subsystem and
 * how the UI should react to each. Source-agnostic: a `PDF_ENCRYPTED` thrown
 * from the file picker, a catalog import, a folder scan, or a future URL→PDF
 * path all produce the same message.
 *
 * - `color: "warning"` for expected user states (no input, unsupported
 *   format variant, input rejected by a guard).
 * - Codes not listed here fall through to the generic "Import Failed" alert.
 */
export const ERROR_TOASTS: Record<string, { msg: string; color: "warning" | "danger" }> = {
	EMPTY: { msg: "Nothing to paste", color: "warning" },
	INVALID_URL: { msg: "That doesn't look like a URL", color: "warning" },
	TOO_LARGE: { msg: "Page too large to import", color: "warning" },
	FILE_TOO_LARGE: { msg: "File too large to import", color: "warning" },
	FILE_READ_FAILED: { msg: "Couldn't read this file", color: "warning" },
	PDF_ENCRYPTED: { msg: "Password-protected PDFs aren't supported", color: "warning" },
	PDF_NO_TEXT: { msg: "This PDF has no selectable text", color: "warning" },
	EPUB_INVALID: { msg: "This EPUB file is corrupted or unsupported", color: "warning" },
};

/**
 * Codes that the UI handles without surfacing an alert — either because
 * they represent a user action (cancel) or because they fire a toast via
 * `ERROR_TOASTS` instead. `FETCH_FAILED` still raises the alert (with a
 * friendlier message); everything else unknown also raises it verbatim.
 */
export const ALERT_SUPPRESSED: ReadonlySet<string> = new Set([
	"CANCELLED",
	...Object.keys(ERROR_TOASTS),
]);

/**
 * A reader-facing reason for one failed import. Used where a failure is listed
 * rather than raised, such as the per-file summary after a batch run.
 */
export function importErrorMessage(err: unknown): string {
	if (!(err instanceof Error)) return "Import failed";
	return ERROR_TOASTS[err.message]?.msg ?? "Couldn't import this file";
}
