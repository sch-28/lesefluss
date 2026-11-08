import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@lesefluss/ui/accordion";
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
import {
	AlertCircle,
	BarChart3,
	BookmarkIcon,
	BookOpen,
	Library,
	TriangleAlert,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import { useToast } from "@/components/toast";
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
		<section className="mt-5">
			<div className="overflow-hidden rounded-lg border border-border bg-card">
				<Accordion type="single" collapsible>
					<AccordionItem value="danger-zone" className="border-b-0">
						<AccordionTrigger className="bg-destructive/10 px-4 text-destructive">
							<span className="flex items-center gap-2">
								<TriangleAlert className="size-4" />
								{isSynced ? "Danger zone" : "Delete local data"}
							</span>
						</AccordionTrigger>
						<AccordionContent className="p-0">
							<p className="px-4 py-3 text-muted-foreground text-xs">
								{isSynced
									? "Permanently delete data on this device. Changes sync to your cloud account and other devices on next sync. This cannot be undone."
									: "Permanently delete data stored on this device. This cannot be undone."}
							</p>
							<div className="divide-y divide-border">
								{ACTION_ORDER.map((action) => {
									const cfg = DANGER_ACTIONS[action];
									return (
										<button
											key={action}
											type="button"
											onClick={() => setPendingAction(action)}
											className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60"
										>
											<cfg.icon className="size-5 text-destructive" />
											<div className="flex-1">
												<div
													className={
														action === "everything"
															? "font-semibold text-destructive text-sm"
															: "font-medium text-foreground text-sm"
													}
												>
													{cfg.label}
												</div>
												<div className="text-muted-foreground text-xs">{cfg.subtitle}</div>
											</div>
										</button>
									);
								})}
								{children}
							</div>
						</AccordionContent>
					</AccordionItem>
				</Accordion>
			</div>

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
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={() => {
								if (pendingAction) runDangerAction(pendingAction);
							}}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</section>
	);
}
