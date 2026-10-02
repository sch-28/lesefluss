import { toast } from "../../components/toast";

export function toastAdded(title: string, onOpen: () => void) {
	toast.success(`Added "${title}" to your library`, { action: { label: "Open", onClick: onOpen } });
}

export function toastImportFailed(title: string, onRetry: () => void) {
	toast.error(`Couldn't add "${title}"`, { action: { label: "Retry", onClick: onRetry } });
}
