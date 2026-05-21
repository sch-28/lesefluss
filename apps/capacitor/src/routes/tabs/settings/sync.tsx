import { Browser } from "@capacitor/browser";
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
import { Button } from "@lesefluss/ui/button";
import { Switch } from "@lesefluss/ui/switch";
import { createFileRoute } from "@tanstack/react-router";
import {
	AlertCircle,
	BarChart3,
	BookmarkIcon,
	BookOpen,
	Cloud,
	CloudCheck,
	Library,
	LogOut,
	RefreshCw,
	TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { useToast } from "@/components/toast";
import { useSyncContext } from "@/contexts/sync-context";
import { queryHooks } from "@/services/db/hooks";
import { beginAuthLoginHandoff, IS_WEB_BUILD } from "@/services/sync";
import { SYNC_URL } from "@/services/sync/auth-client";

export const Route = createFileRoute("/tabs/settings/sync")({
	component: SyncSettings,
});

function formatLastSynced(ms: number | null): string {
	if (!ms) return "Never";
	const diff = Date.now() - ms;
	if (diff < 60_000) return "Just now";
	if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
	return new Date(ms).toLocaleString();
}

type DangerAction = "highlights" | "glossary" | "stats" | "library" | "everything";

type DangerActionConfig = {
	label: string;
	subtitle: string;
	icon: typeof BookmarkIcon;
	header: string;
	message: string;
	successMessage: string;
};

const DANGER_ACTIONS: Record<DangerAction, DangerActionConfig> = {
	highlights: {
		label: "Delete all highlights",
		subtitle: "Every highlight and note across all books",
		icon: BookmarkIcon,
		header: "Delete all highlights?",
		message:
			"Every highlight and note across all books will be permanently removed from this device and from your cloud account.",
		successMessage: "Highlights deleted",
	},
	glossary: {
		label: "Delete glossary entries",
		subtitle: "Includes global entries not tied to a book",
		icon: BookOpen,
		header: "Delete glossary entries?",
		message:
			"Every glossary entry (including global ones not tied to a specific book) will be permanently removed from this device and from your cloud account.",
		successMessage: "Glossary deleted",
	},
	stats: {
		label: "Delete reading stats",
		subtitle: "Wipes every reading session, keeps your library",
		icon: BarChart3,
		header: "Delete reading stats?",
		message:
			"Every reading session on this device and on your cloud account will be wiped. Your library and highlights are kept. Other signed-in devices may push their own session history back on their next sync.",
		successMessage: "Reading stats deleted",
	},
	library: {
		label: "Delete library",
		subtitle: "All books and web-novels, plus their highlights",
		icon: Library,
		header: "Delete entire library?",
		message:
			"All books, web-novels, chapters, and their highlights and book-scoped glossary entries will be removed. Files are deleted from this device. Your reading stats are kept.",
		successMessage: "Library deleted",
	},
	everything: {
		label: "Delete everything",
		subtitle: "Wipes all content. Settings and sign-in are kept.",
		icon: AlertCircle,
		header: "Delete everything?",
		message:
			"Wipes your library, highlights, glossary entries, and reading stats from this device and from your cloud account. You stay signed in and your settings are kept. This cannot be undone.",
		successMessage: "All data deleted",
	},
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="mt-6 first:mt-2">
			<h2 className="px-4 pb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
				{title}
			</h2>
			<div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
				{children}
			</div>
		</section>
	);
}

function ToggleRow({
	title,
	subtitle,
	checked,
	onCheckedChange,
}: {
	title: string;
	subtitle: string;
	checked: boolean;
	onCheckedChange: (v: boolean) => void;
}) {
	return (
		<div className="flex items-center justify-between gap-3 px-4 py-3">
			<div className="min-w-0">
				<div className="font-medium text-foreground text-sm">{title}</div>
				<div className="text-muted-foreground text-xs">{subtitle}</div>
			</div>
			<Switch checked={checked} onCheckedChange={onCheckedChange} />
		</div>
	);
}

function SyncSettings() {
	const { isLoggedIn, userEmail, isSyncing, lastSynced, syncError, logout, syncNow } =
		useSyncContext();
	const { data: settings } = queryHooks.useSettings();
	const saveSettings = queryHooks.useSaveSettings();
	const { showToast } = useToast();

	const deleteAllHighlights = queryHooks.useDeleteAllHighlights();
	const deleteAllGlossary = queryHooks.useDeleteAllGlossary();
	const deleteAllReadingSessions = queryHooks.useDeleteAllReadingSessions();
	const deleteLibrary = queryHooks.useDeleteLibrary();
	const deleteEverything = queryHooks.useDeleteEverything();

	const [pendingAction, setPendingAction] = useState<DangerAction | null>(null);

	const runDangerAction = (action: DangerAction) => {
		const cfg = DANGER_ACTIONS[action];
		const onSuccess = () => showToast(cfg.successMessage, "success");
		const onError = () => showToast("Failed to delete data", "danger");
		switch (action) {
			case "highlights":
				deleteAllHighlights.mutate(undefined, { onSuccess, onError });
				break;
			case "glossary":
				deleteAllGlossary.mutate(undefined, { onSuccess, onError });
				break;
			case "stats":
				deleteAllReadingSessions.mutate(undefined, { onSuccess, onError });
				break;
			case "library":
				deleteLibrary.mutate(undefined, { onSuccess, onError });
				break;
			case "everything":
				deleteEverything.mutate(undefined, { onSuccess, onError });
				break;
		}
	};

	const pendingCfg = pendingAction ? DANGER_ACTIONS[pendingAction] : null;

	return (
		<div className="bg-background">
			<PageHeader title="Cloud sync" icon={isLoggedIn ? CloudCheck : Cloud} />
			<div className="mx-auto max-w-2xl px-4 pb-10">
				{isLoggedIn ? (
					<>
						<Section title="Account">
							<div className="flex items-center gap-3 px-4 py-3">
								<CloudCheck className="size-5 text-emerald-500" />
								<div className="flex-1">
									<div className="font-medium text-foreground text-sm">{userEmail}</div>
									<div className="text-muted-foreground text-xs">
										Last synced {formatLastSynced(lastSynced)}
									</div>
								</div>
							</div>
							{syncError && <div className="px-4 py-2 text-destructive text-sm">{syncError}</div>}
							<div className="p-3">
								<Button variant="outline" className="w-full" onClick={syncNow} disabled={isSyncing}>
									<RefreshCw className={isSyncing ? "animate-spin" : ""} />
									{isSyncing ? "Syncing..." : "Sync now"}
								</Button>
							</div>
						</Section>

						<Section title="What syncs">
							<p className="px-4 pt-3 text-muted-foreground text-xs">
								Toggle off to stop this device from syncing that data. Existing cloud data stays
								put. To wipe data, use the Danger zone below.
							</p>
							<ToggleRow
								title="Highlights"
								subtitle="Highlights and notes inside books"
								checked={settings?.syncHighlights ?? true}
								onCheckedChange={(v) => saveSettings.mutate({ syncHighlights: v })}
							/>
							<ToggleRow
								title="Glossary entries"
								subtitle="Per-book and global glossary terms"
								checked={settings?.syncGlossary ?? true}
								onCheckedChange={(v) => saveSettings.mutate({ syncGlossary: v })}
							/>
							<ToggleRow
								title="Reading stats"
								subtitle="Sessions, streaks, and time-of-day data"
								checked={settings?.syncStats ?? true}
								onCheckedChange={(v) => saveSettings.mutate({ syncStats: v })}
							/>
						</Section>

						<section className="mt-6">
							<div className="overflow-hidden rounded-lg border border-border bg-card">
								<Accordion type="single" collapsible>
									<AccordionItem value="danger-zone" className="border-b-0">
										<AccordionTrigger className="bg-destructive/10 px-4 text-destructive">
											<span className="flex items-center gap-2">
												<TriangleAlert className="size-4" />
												Danger zone
											</span>
										</AccordionTrigger>
										<AccordionContent className="p-0">
											<p className="px-4 py-3 text-muted-foreground text-xs">
												Permanently delete data on this device. Changes sync to your cloud account
												and other devices on next sync. This cannot be undone.
											</p>
											<div className="divide-y divide-border">
												{(
													["highlights", "glossary", "stats", "library", "everything"] as const
												).map((action) => {
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
											</div>
										</AccordionContent>
									</AccordionItem>
								</Accordion>
							</div>
						</section>

						{!IS_WEB_BUILD && (
							<Section title="">
								<button
									type="button"
									onClick={logout}
									className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60"
								>
									<LogOut className="size-5 text-muted-foreground" />
									<span className="font-medium text-foreground text-sm">Sign out</span>
								</button>
							</Section>
						)}

						<AlertDialog
							open={pendingAction !== null}
							onOpenChange={(open) => !open && setPendingAction(null)}
						>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>{pendingCfg?.header}</AlertDialogTitle>
									<AlertDialogDescription>{pendingCfg?.message}</AlertDialogDescription>
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
					</>
				) : (
					<Section title="Not signed in">
						<div className="flex items-center gap-3 px-4 py-3">
							<Cloud className="size-5 shrink-0 text-muted-foreground" />
							<p className="text-muted-foreground text-sm">
								{IS_WEB_BUILD
									? "Sign in on the main website to sync your library, reading progress, and highlights."
									: "Sign in on the website to sync your library, reading progress, and highlights across devices."}
							</p>
						</div>
						{syncError && <div className="px-4 py-2 text-destructive text-sm">{syncError}</div>}
						<div className="p-3">
							{IS_WEB_BUILD ? (
								<Button asChild className="w-full">
									<a href="/login" target="_top" rel="noreferrer">
										Sign in
									</a>
								</Button>
							) : (
								<Button
									className="w-full"
									onClick={async () => {
										const state = await beginAuthLoginHandoff();
										await Browser.open({
											url: `${SYNC_URL}/auth/mobile-callback?state=${encodeURIComponent(state)}`,
										});
									}}
								>
									Sign in
								</Button>
							)}
						</div>
					</Section>
				)}
			</div>
		</div>
	);
}
