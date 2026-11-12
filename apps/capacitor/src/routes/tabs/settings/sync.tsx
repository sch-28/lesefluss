import { Button } from "@lesefluss/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { Cloud, CloudCheck, LogOut, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { ToggleRow } from "@/components/app-shell/toggle-row";
import { SettingsSection } from "@/components/settings/settings-section";
import { CloudStorageSection } from "@/components/sync/cloud-storage";
import { DangerZone } from "@/components/sync/danger-zone";
import { DeleteAccountRow } from "@/components/sync/delete-account";
import { SignInPanel } from "@/components/sync/sign-in-panel";
import { useSyncContext } from "@/contexts/sync-context";
import { queryHooks } from "@/services/db/hooks";
import { IS_WEB_BUILD } from "@/services/sync";

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

function SyncSettings() {
	const { isLoggedIn, userEmail, isSyncing, lastSynced, syncError, logout, syncNow } =
		useSyncContext();
	const { data: settings } = queryHooks.useSettings();
	const saveSettings = queryHooks.useSaveSettings();

	return (
		<div className="bg-background">
			<PageHeader title="Cloud sync" icon={isLoggedIn ? CloudCheck : Cloud} />
			<div className="mx-auto max-w-2xl px-4 pb-10">
				{isLoggedIn ? (
					<>
						<SettingsSection title="Account">
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
						</SettingsSection>

						<CloudStorageSection />

						<SettingsSection title="What syncs">
							<p className="px-4 py-3 text-muted-foreground text-xs">
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
						</SettingsSection>

						<DangerZone isSynced>
							<DeleteAccountRow />
						</DangerZone>

						{!IS_WEB_BUILD && (
							<SettingsSection>
								<button
									type="button"
									onClick={logout}
									className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60"
								>
									<LogOut className="size-5 text-muted-foreground" />
									<span className="font-medium text-foreground text-sm">Sign out</span>
								</button>
							</SettingsSection>
						)}
					</>
				) : (
					<>
						<SignInPanel
							benefit={
								IS_WEB_BUILD
									? "Sign in to sync your library, reading progress, and highlights, and to read books together with friends."
									: "Sign in to sync your library, reading progress, and highlights across devices, and to read books together with friends."
							}
						/>
						<DangerZone isSynced={false} />
					</>
				)}
			</div>
		</div>
	);
}
