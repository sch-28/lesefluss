import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@lesefluss/ui/alert-dialog";
import { AlertCircle, BarChart3, BookmarkIcon, BookOpen, Library } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { useToast } from "@/components/toast";
import { DangerRow, DangerZone as DangerZoneFrame } from "@/pages/_shared/danger-zone";
import { queryHooks } from "@/services/db/hooks";

type DangerAction = "highlights" | "glossary" | "stats" | "library" | "everything";

type DangerActionConfig = {
	label: string;
	subtitle: string;
	icon: typeof BookmarkIcon;
	header: string;
	/** Signed in: the deletion reaches the cloud account and the other devices too. */
	syncedMessage: string;
	localMessage: string;
	successMessage: string;
};

const DANGER_ACTIONS: Record<DangerAction, DangerActionConfig> = {
	highlights: {
		label: "Delete all highlights",
		subtitle: "Every highlight and note across all books",
		icon: BookmarkIcon,
		header: "Delete all highlights?",
		syncedMessage:
			"Every highlight and note across all books will be permanently removed from this device and from your cloud account.",
		localMessage:
			"Every highlight and note across all books will be permanently removed from this device.",
		successMessage: "Highlights deleted",
	},
	glossary: {
		label: "Delete glossary entries",
		subtitle: "Includes global entries not tied to a book",
		icon: BookOpen,
		header: "Delete glossary entries?",
		syncedMessage:
			"Every glossary entry (including global ones not tied to a specific book) will be permanently removed from this device and from your cloud account.",
		localMessage:
			"Every glossary entry (including global ones not tied to a specific book) will be permanently removed from this device.",
		successMessage: "Glossary deleted",
	},
	stats: {
		label: "Delete reading stats",
		subtitle: "Wipes every reading session, goal and speed test, keeps your library",
		icon: BarChart3,
		header: "Delete reading stats?",
		syncedMessage:
			"Every reading session, reading goal and speed test will be wiped from this device and your cloud account. Other devices drop the goals on their next sync, and the sessions and speed tests too if they sync reading stats, but sessions a device recorded offline and hasn't synced yet still arrive afterwards. Your library, highlights and bookmarks are kept.",
		localMessage:
			"Every reading session, reading goal and speed test will be wiped from this device. Your library, highlights and bookmarks are kept.",
		successMessage: "Reading stats deleted",
	},
	library: {
		label: "Delete library",
		subtitle: "All books and web-novels, plus their highlights and bookmarks",
		icon: Library,
		header: "Delete entire library?",
		syncedMessage:
			"All books, web-novels, chapters, and their highlights, bookmarks and book-scoped glossary entries will be removed. Files are deleted from this device. Your reading stats are kept.",
		localMessage:
			"All books, web-novels, chapters, and their highlights, bookmarks and book-scoped glossary entries will be removed from this device, files included. Your reading stats are kept.",
		successMessage: "Library deleted",
	},
	everything: {
		label: "Delete everything",
		subtitle: "Wipes all content. Settings are kept.",
		icon: AlertCircle,
		header: "Delete everything?",
		syncedMessage:
			"Wipes your library, highlights, bookmarks, glossary entries, wishlist, and reading stats from this device and from your cloud account. You stay signed in and your settings are kept. This cannot be undone.",
		localMessage:
			"Wipes your library, highlights, bookmarks, glossary entries, wishlist, and reading stats from this device. Your settings are kept. This cannot be undone.",
		successMessage: "All data deleted",
	},
};

const ACTION_ORDER = ["highlights", "glossary", "stats", "library", "everything"] as const;

/**
 * Bulk deletions. Signed in they sync to the cloud account; signed out they are
 * this device's "Delete local data". `children` adds rows below the deletions.
 */
export function DangerZone({
	isSynced,
	children,
}: {
	isSynced: boolean;
	children?: React.ReactNode;
}) {
	const { showToast } = useToast();
	const deleteAllHighlights = queryHooks.useDeleteAllHighlights();
	const deleteAllGlossary = queryHooks.useDeleteAllGlossary();
	const deleteAllReadingSessions = queryHooks.useDeleteAllReadingSessions();
	const deleteLibrary = queryHooks.useDeleteLibrary();
	const deleteEverything = queryHooks.useDeleteEverything();
	const mutations = {
		highlights: deleteAllHighlights,
		glossary: deleteAllGlossary,
		stats: deleteAllReadingSessions,
		library: deleteLibrary,
		everything: deleteEverything,
	} satisfies Record<DangerAction, unknown>;

	const [pendingAction, setPendingAction] = useState<DangerAction | null>(null);
	const pendingCfg = pendingAction ? DANGER_ACTIONS[pendingAction] : null;

	const runDangerAction = (action: DangerAction) => {
		mutations[action].mutate(undefined, {
			onSuccess: () => showToast(DANGER_ACTIONS[action].successMessage, "success"),
			onError: () => showToast("Failed to delete data", "danger"),
		});
	};

	return (
		<div className="pt-6">
			<DangerZoneFrame
				collapsible
				title={isSynced ? "Danger zone" : "Delete local data"}
				description={
					isSynced
						? "Permanently delete data on this device. Changes sync to your cloud account and other devices on next sync. This cannot be undone."
						: "Permanently delete data stored on this device. This cannot be undone."
				}
			>
				{ACTION_ORDER.map((action) => {
					const cfg = DANGER_ACTIONS[action];
					return (
						<DangerRow
							key={action}
							icon={cfg.icon}
							subtitle={cfg.subtitle}
							onClick={() => setPendingAction(action)}
						>
							{cfg.label}
						</DangerRow>
					);
				})}
				{children}
			</DangerZoneFrame>

			<AlertDialog
				open={pendingAction !== null}
				onOpenChange={(open) => !open && setPendingAction(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{pendingCfg?.header}</AlertDialogTitle>
						<AlertDialogDescription>
							{isSynced ? pendingCfg?.syncedMessage : pendingCfg?.localMessage}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={() => {
								if (pendingAction) runDangerAction(pendingAction);
							}}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
