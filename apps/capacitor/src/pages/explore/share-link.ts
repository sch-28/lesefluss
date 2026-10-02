import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { toast } from "../../components/toast";
import { claimedOrigin } from "../../services/deep-links/parse";
import { copyToClipboard } from "../../utils/clipboard";

/**
 * Link to a catalog book in the web build. It opens for anyone, with or
 * without the app; the app does not claim /app paths (docs/deep-links.md).
 */
export function catalogBookUrl(catalogId: string): string {
	return `${claimedOrigin()}/app/tabs/explore/book/${encodeURIComponent(catalogId)}`;
}

/** Native share sheet; on web, where there isn't one, copy the link. */
export async function shareLink(title: string, url: string, dialogTitle: string): Promise<void> {
	if (Capacitor.isNativePlatform()) {
		// Dismissing the sheet rejects; that is not an error worth showing.
		await Share.share({ title, url, dialogTitle }).catch(() => {});
		return;
	}
	if (await copyToClipboard(url)) toast.success("Link copied");
	else toast.error("Couldn't copy the link");
}

export function shareCatalogBook(book: { id: string; title: string }): Promise<void> {
	return shareLink(book.title, catalogBookUrl(book.id), "Share book");
}
