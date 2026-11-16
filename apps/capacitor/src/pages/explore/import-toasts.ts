import { toast } from "../../components/toast";

/** One id per import, so its loading toast turns into the result in place. */
export function importToastId(key: string): string {
	return `import:${key}`;
}

export function toastImporting(id: string, title: string) {
	toast.loading(`Adding "${title}"…`, { id });
}

export function toastAdded(id: string, title: string, onOpen: () => void) {
	toast.success(`Added "${title}" to your library`, {
		id,
		action: { label: "Open", onClick: onOpen },
	});
}

export function toastImportFailed(id: string, title: string, onRetry: () => void) {
	toast.error(`Couldn't add "${title}"`, { id, action: { label: "Retry", onClick: onRetry } });
}
