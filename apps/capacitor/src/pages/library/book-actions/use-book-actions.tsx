import { type BookStatus, bookStatus, isBookStatus } from "@lesefluss/core";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import {
	BookMarked,
	BookOpen,
	BookText,
	CheckSquare,
	FolderPlus,
	Layers,
	type LucideIcon,
	Pencil,
	RotateCcw,
	Share2,
	Star,
	Trash2,
} from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import {
	CollectionPickerSheet,
	type PickerKind,
} from "../../../components/collections/collection-picker-sheet";
import { ConfirmDialog } from "../../../components/confirm-dialog";
import { ShareSheet } from "../../../components/social/share-sheet";
import { useSyncContext } from "../../../contexts/sync-context";
import { queryHooks } from "../../../services/db/hooks";
import { syncKeys } from "../../../services/db/hooks/query-keys";
import { useCloudStorage } from "../../../services/db/hooks/use-cloud-storage";
import type { Book } from "../../../services/db/schema";
import { SYNC_ENABLED } from "../../../services/sync";
import { getServerContentIds } from "../../../services/sync/server-content-cache";
import { shareBlockerFor } from "../book-buddy-read";
import {
	type BookActionId,
	type BookActionSurface,
	bookActionIds,
	opensReader,
} from "./book-action-items";
import { BookActionsSheet } from "./book-actions-sheet";

export type BookActionItem = {
	kind: "item";
	id: string;
	label: string;
	icon: LucideIcon;
	onSelect: () => void;
	destructive?: boolean;
	disabled?: boolean;
};

export type BookActionEntry =
	| BookActionItem
	| {
			kind: "status";
			id: "status";
			label: string;
			icon: LucideIcon;
			/** The status the reader set, null on Automatic. */
			stored: BookStatus | null;
			/** What Automatic currently makes of the book. */
			automatic: BookStatus;
			onPick: (status: BookStatus | null) => void;
	  }
	| {
			kind: "rate";
			id: "rate";
			label: string;
			icon: LucideIcon;
			rating: number | null;
			onRate: (rating: number | null) => void;
	  };

export type BookActionExtra = Omit<BookActionItem, "kind" | "id">;

type Options = {
	surface: BookActionSurface;
	/** Library only: starts a selection with the book. */
	onSelect?: (book: Book) => void;
	onDeleted?: (book: Book) => void;
	/** Surface-own actions, placed after Reset progress. */
	extras?: (book: Book) => BookActionExtra[];
};

/**
 * The one book menu (decision 973d54c8 on LESE-185): every surface gets the
 * same entries in the same order and the same overlays behind them. The
 * overlays hold their own book, so they outlive the menu that opened them.
 */
export function useBookActions({ surface, onSelect, onDeleted, extras }: Options) {
	const router = useRouter();
	const { isLoggedIn } = useSyncContext();
	const canShare = isLoggedIn && SYNC_ENABLED;
	const update = queryHooks.useUpdateBook();
	const reset = queryHooks.useResetBookProgress();
	const remove = queryHooks.useDeleteBook();
	const [menuBook, setMenuBook] = useState<Book | null>(null);
	const [picker, setPicker] = useState<{ book: Book; kind: PickerKind } | null>(null);
	const [shareBook, setShareBook] = useState<Book | null>(null);
	const [resetBook, setResetBook] = useState<Book | null>(null);
	const [deleteBook, setDeleteBook] = useState<Book | null>(null);
	const pickerBooks = useMemo(() => (picker ? [picker.book] : []), [picker]);

	const { data: cloudStorage } = useCloudStorage(canShare);
	const { data: serverContentIds } = useQuery({
		queryKey: syncKeys.serverContentIds,
		queryFn: getServerContentIds,
		enabled: canShare && shareBook !== null,
		staleTime: 0,
	});

	const entriesFor = (book: Book): BookActionEntry[] => {
		const go = (path: string) => router.history.push(path);
		const open: BookActionItem = opensReader(surface)
			? {
					kind: "item",
					id: "open",
					label: "Continue reading",
					icon: BookOpen,
					onSelect: () => go(`/tabs/reader/${book.id}`),
				}
			: surface === "reader" && book.seriesId != null
				? {
						kind: "item",
						id: "open",
						label: "View series",
						icon: BookText,
						onSelect: () => go(`/tabs/library/series/${book.seriesId}`),
					}
				: {
						kind: "item",
						id: "open",
						label: "Details",
						icon: BookText,
						onSelect: () => go(`/tabs/library/book/${book.id}`),
					};
		const surfaceExtras = extras?.(book) ?? [];
		const ids = bookActionIds({
			canShare,
			canSelect: onSelect !== undefined,
			hasExtras: surfaceExtras.length > 0,
		});
		const entriesOf = (id: BookActionId): BookActionEntry[] => {
			switch (id) {
				case "open":
					return [open];
				case "status":
					return [
						{
							kind: "status",
							id,
							label: "Set status",
							icon: BookMarked,
							stored: isBookStatus(book.status) ? book.status : null,
							automatic: bookStatus({ ...book, status: null }),
							onPick: (status) => update.mutate({ id: book.id, values: { status } }),
						},
					];
				case "rate":
					return [
						{
							kind: "rate",
							id,
							label: "Rate",
							icon: Star,
							rating: book.rating,
							onRate: (rating) => update.mutate({ id: book.id, values: { rating } }),
						},
					];
				case "series":
					return [item(id, "Add to series…", Layers, () => setPicker({ book, kind: "series" }))];
				case "collection":
					return [
						item(id, "Add to collection…", FolderPlus, () =>
							setPicker({ book, kind: "collection" }),
						),
					];
				case "edit":
					return [item(id, "Edit", Pencil, () => go(`/tabs/library/book/${book.id}/edit`))];
				case "share":
					return [item(id, "Share", Share2, () => setShareBook(book))];
				case "reset":
					return [item(id, "Reset progress", RotateCcw, () => setResetBook(book))];
				case "extras":
					return surfaceExtras.map((extra, i) => ({ kind: "item", id: `extra-${i}`, ...extra }));
				case "select":
					return [item(id, "Select", CheckSquare, () => onSelect?.(book))];
				case "delete":
					return [
						{
							...item(id, "Delete", Trash2, () => setDeleteBook(book)),
							destructive: true,
						},
					];
			}
		};
		return ids.flatMap(entriesOf);
	};

	const overlays: React.ReactNode = (
		<>
			<BookActionsSheet
				book={menuBook}
				entries={menuBook ? entriesFor(menuBook) : []}
				onClose={() => setMenuBook(null)}
			/>
			<CollectionPickerSheet
				books={pickerBooks}
				kind={picker?.kind}
				open={picker !== null}
				onClose={() => setPicker(null)}
			/>
			<ShareSheet
				isOpen={shareBook !== null && canShare}
				onClose={() => setShareBook(null)}
				bookId={shareBook?.id ?? ""}
				bookTitle={shareBook?.title ?? ""}
				blocker={
					shareBook
						? shareBlockerFor(
								shareBook,
								serverContentIds,
								new Set(cloudStorage?.notBackedUp.map((b) => b.id)),
							)
						: null
				}
			/>
			<ConfirmDialog
				open={resetBook !== null}
				onOpenChange={(open) => {
					if (!open) setResetBook(null);
				}}
				title="Reset progress?"
				description={
					resetBook
						? `"${resetBook.title}" goes back to its first page${resetBook.finishedAt == null ? " and to Want to read" : ""}. Your reading history stays.`
						: undefined
				}
				confirmLabel="Reset"
				destructive
				onConfirm={() => {
					if (resetBook) reset.mutate(resetBook.id);
					setResetBook(null);
				}}
			/>
			<ConfirmDialog
				open={deleteBook !== null}
				onOpenChange={(open) => {
					if (!open) setDeleteBook(null);
				}}
				title="Delete book?"
				description={
					deleteBook ? `"${deleteBook.title}" will be removed from your library.` : undefined
				}
				confirmLabel="Delete"
				destructive
				onConfirm={() => {
					const book = deleteBook;
					setDeleteBook(null);
					if (book) remove.mutate(book, { onSuccess: () => onDeleted?.(book) });
				}}
			/>
		</>
	);

	return { entriesFor, open: setMenuBook, overlays };
}

function item(id: string, label: string, icon: LucideIcon, onSelect: () => void): BookActionItem {
	return { kind: "item", id, label, icon, onSelect };
}
