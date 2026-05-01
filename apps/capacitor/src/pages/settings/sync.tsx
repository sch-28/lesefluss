import { Browser } from "@capacitor/browser";
import {
	IonAccordion,
	IonAccordionGroup,
	IonAlert,
	IonBackButton,
	IonButton,
	IonButtons,
	IonContent,
	IonHeader,
	IonIcon,
	IonItem,
	IonLabel,
	IonList,
	IonListHeader,
	IonPage,
	IonSpinner,
	IonTitle,
	IonToggle,
	IonToolbar,
} from "@ionic/react";
import {
	alertCircleOutline,
	bookmarkOutline,
	bookOutline,
	cloudDone,
	cloudOutline,
	libraryOutline,
	logOutOutline,
	statsChartOutline,
	syncOutline,
	warningOutline,
} from "ionicons/icons";
import type React from "react";
import { useState } from "react";
import { useToast } from "../../components/toast";
import { useSyncContext } from "../../contexts/sync-context";
import { queryHooks } from "../../services/db/hooks";
import { beginMobileLogin, IS_WEB_BUILD } from "../../services/sync";
import { SYNC_URL } from "../../services/sync/auth-client";

function formatLastSynced(ms: number | null): string {
	if (!ms) return "Never";
	const diff = Date.now() - ms;
	if (diff < 60_000) return "Just now";
	if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
	return new Date(ms).toLocaleString();
}

function SyncErrorText({ children }: { children: React.ReactNode }) {
	return (
		<div className="ion-padding-horizontal ion-padding-top">
			<p
				style={{
					margin: 0,
					fontSize: "14px",
					color: "var(--ion-color-danger, #ef4444)",
				}}
			>
				{children}
			</p>
		</div>
	);
}

type DangerAction = "highlights" | "glossary" | "stats" | "library" | "everything";

type DangerActionConfig = {
	label: string;
	subtitle: string;
	icon: string;
	header: string;
	message: string;
	successMessage: string;
};

const DANGER_RED = "#c53030";

const DANGER_ACTIONS: Record<DangerAction, DangerActionConfig> = {
	highlights: {
		label: "Delete all highlights",
		subtitle: "Every highlight and note across all books",
		icon: bookmarkOutline,
		header: "Delete all highlights?",
		message:
			"Every highlight and note across all books will be permanently removed from this device and from your cloud account.",
		successMessage: "Highlights deleted",
	},
	glossary: {
		label: "Delete glossary entries",
		subtitle: "Includes global entries not tied to a book",
		icon: bookOutline,
		header: "Delete glossary entries?",
		message:
			"Every glossary entry (including global ones not tied to a specific book) will be permanently removed from this device and from your cloud account.",
		successMessage: "Glossary deleted",
	},
	stats: {
		label: "Delete reading stats",
		subtitle: "Wipes every reading session, keeps your library",
		icon: statsChartOutline,
		header: "Delete reading stats?",
		message:
			"Every reading session on this device and on your cloud account will be wiped. Your library and highlights are kept. Other signed-in devices may push their own session history back on their next sync.",
		successMessage: "Reading stats deleted",
	},
	library: {
		label: "Delete library",
		subtitle: "All books and web-novels, plus their highlights",
		icon: libraryOutline,
		header: "Delete entire library?",
		message:
			"All books, web-novels, chapters, and their highlights and book-scoped glossary entries will be removed. Files are deleted from this device. Your reading stats are kept.",
		successMessage: "Library deleted",
	},
	everything: {
		label: "Delete everything",
		subtitle: "Wipes all content. Settings and sign-in are kept.",
		icon: alertCircleOutline,
		header: "Delete everything?",
		message:
			"Wipes your library, highlights, glossary entries, and reading stats from this device and from your cloud account. You stay signed in and your settings are kept. This cannot be undone.",
		successMessage: "All data deleted",
	},
};

const SUBTLE_NOTE_PARAGRAPH_STYLE: React.CSSProperties = {
	margin: "8px 16px 0",
	fontSize: "13px",
	color: "var(--ion-color-medium)",
};

const DANGER_HEADER_STYLE = {
	"--background": DANGER_RED,
	"--color": "#ffffff",
	"--inner-padding-end": "16px",
} as React.CSSProperties;

const ITEM_SUBTITLE_STYLE: React.CSSProperties = {
	fontSize: "12px",
	color: "var(--ion-color-medium)",
	margin: 0,
};

const SECTION_GAP_STYLE: React.CSSProperties = { height: "8px" };

const WHITE_ICON_STYLE: React.CSSProperties = { color: "#ffffff" };

const DANGER_ICON_STYLE: React.CSSProperties = { color: DANGER_RED };

const DANGER_LABEL_STYLE: React.CSSProperties = { color: DANGER_RED, fontWeight: 600 };

const SyncSettings: React.FC = () => {
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

	return (
		<IonPage>
			<IonHeader class="ion-no-border">
				<IonToolbar>
					<IonButtons slot="start">
						<IonBackButton defaultHref="/tabs/settings" />
					</IonButtons>
					<IonTitle>Cloud Sync</IonTitle>
				</IonToolbar>
			</IonHeader>
			<IonContent>
				{isLoggedIn && (
					<>
						<IonList className="content-container">
							<IonListHeader>
								<IonLabel>Account</IonLabel>
							</IonListHeader>
							<IonItem lines="none">
								<IonIcon icon={cloudDone} slot="start" color="success" />
								<IonLabel>
									<h2>{userEmail}</h2>
									<p>Last synced {formatLastSynced(lastSynced)}</p>
								</IonLabel>
							</IonItem>

							{syncError && <SyncErrorText>{syncError}</SyncErrorText>}

							<div className="ion-padding">
								<IonButton expand="block" fill="outline" onClick={syncNow} disabled={isSyncing}>
									{isSyncing ? (
										<IonSpinner name="crescent" />
									) : (
										<IonIcon icon={syncOutline} slot="start" />
									)}
									{isSyncing ? "Syncing..." : "Sync Now"}
								</IonButton>
							</div>
						</IonList>

						<div style={SECTION_GAP_STYLE} />

						<IonList className="content-container">
							<IonListHeader>
								<IonLabel>What syncs</IonLabel>
							</IonListHeader>
							<p style={SUBTLE_NOTE_PARAGRAPH_STYLE}>
								Toggle off to stop this device from syncing that data. Existing cloud data stays
								put. To wipe data, use the Danger zone below.
							</p>
							<IonItem>
								<IonLabel>
									<h2>Highlights</h2>
									<p style={ITEM_SUBTITLE_STYLE}>Highlights and notes inside books</p>
								</IonLabel>
								<IonToggle
									slot="end"
									checked={settings?.syncHighlights ?? true}
									onIonChange={(e) => saveSettings.mutate({ syncHighlights: e.detail.checked })}
								/>
							</IonItem>
							<IonItem>
								<IonLabel>
									<h2>Glossary entries</h2>
									<p style={ITEM_SUBTITLE_STYLE}>Per-book and global glossary terms</p>
								</IonLabel>
								<IonToggle
									slot="end"
									checked={settings?.syncGlossary ?? true}
									onIonChange={(e) => saveSettings.mutate({ syncGlossary: e.detail.checked })}
								/>
							</IonItem>
							<IonItem lines="none">
								<IonLabel>
									<h2>Reading stats</h2>
									<p style={ITEM_SUBTITLE_STYLE}>Sessions, streaks, and time-of-day data</p>
								</IonLabel>
								<IonToggle
									slot="end"
									checked={settings?.syncStats ?? true}
									onIonChange={(e) => saveSettings.mutate({ syncStats: e.detail.checked })}
								/>
							</IonItem>
						</IonList>

						<div style={SECTION_GAP_STYLE} />

						<IonAccordionGroup className="content-container">
							<IonAccordion value="danger-zone">
								<IonItem slot="header" lines="none" style={DANGER_HEADER_STYLE}>
									<IonIcon icon={warningOutline} slot="start" style={WHITE_ICON_STYLE} />
									<IonLabel>Danger zone</IonLabel>
								</IonItem>
								<div slot="content">
									<p style={SUBTLE_NOTE_PARAGRAPH_STYLE}>
										Permanently delete data on this device. Changes sync to your cloud account and
										other devices on next sync. This cannot be undone.
									</p>
									<IonList lines="full">
										{(["highlights", "glossary", "stats", "library"] as const).map((action) => {
											const cfg = DANGER_ACTIONS[action];
											return (
												<IonItem
													key={action}
													button
													detail={false}
													onClick={() => setPendingAction(action)}
												>
													<IonIcon icon={cfg.icon} slot="start" style={DANGER_ICON_STYLE} />
													<IonLabel>
														<h2>{cfg.label}</h2>
														<p style={ITEM_SUBTITLE_STYLE}>{cfg.subtitle}</p>
													</IonLabel>
												</IonItem>
											);
										})}
										<IonItem
											button
											detail={false}
											onClick={() => setPendingAction("everything")}
											lines="none"
										>
											<IonIcon
												icon={DANGER_ACTIONS.everything.icon}
												slot="start"
												style={DANGER_ICON_STYLE}
											/>
											<IonLabel>
												<h2 style={DANGER_LABEL_STYLE}>
													{DANGER_ACTIONS.everything.label}
												</h2>
												<p style={ITEM_SUBTITLE_STYLE}>
													{DANGER_ACTIONS.everything.subtitle}
												</p>
											</IonLabel>
										</IonItem>
									</IonList>
								</div>
							</IonAccordion>
						</IonAccordionGroup>

						{!IS_WEB_BUILD && (
							<>
								<div style={SECTION_GAP_STYLE} />
								<IonList className="content-container">
									<IonItem button onClick={logout} detail={false} lines="none">
										<IonIcon icon={logOutOutline} slot="start" color="medium" />
										<IonLabel>Sign out</IonLabel>
									</IonItem>
								</IonList>
							</>
						)}

						<IonAlert
							isOpen={pendingAction !== null}
							onDidDismiss={() => setPendingAction(null)}
							header={pendingAction ? DANGER_ACTIONS[pendingAction].header : undefined}
							message={pendingAction ? DANGER_ACTIONS[pendingAction].message : undefined}
							buttons={[
								{ text: "Cancel", role: "cancel" },
								{
									text: "Delete",
									role: "destructive",
									handler: () => {
										if (pendingAction) runDangerAction(pendingAction);
									},
								},
							]}
							cssClass="rsvp-alert"
						/>
					</>
				)}

				{!isLoggedIn &&
					(IS_WEB_BUILD ? (
						<IonList className="content-container">
							<IonListHeader>
								<IonLabel>Not Signed In</IonLabel>
							</IonListHeader>
							<IonItem>
								<IonIcon icon={cloudOutline} slot="start" color="medium" />
								<IonLabel className="ion-text-wrap">
									<p>
										Sign in on the main website to sync your library, reading progress, and
										highlights.
									</p>
								</IonLabel>
							</IonItem>
							<div className="ion-padding">
								<IonButton expand="block" href="/login" target="_top">
									Sign In
								</IonButton>
							</div>
						</IonList>
					) : (
						<IonList className="content-container">
							<IonListHeader>
								<IonLabel>Not Signed In</IonLabel>
							</IonListHeader>
							<IonItem>
								<IonIcon icon={cloudOutline} slot="start" color="medium" />
								<IonLabel className="ion-text-wrap">
									<p>
										Sign in on the website to sync your library, reading progress, and highlights
										across devices.
									</p>
								</IonLabel>
							</IonItem>

							{syncError && <SyncErrorText>{syncError}</SyncErrorText>}

							<div className="ion-padding">
								<IonButton
									expand="block"
									onClick={async () => {
										const state = await beginMobileLogin();
										await Browser.open({
											url: `${SYNC_URL}/auth/mobile-callback?state=${encodeURIComponent(state)}`,
										});
									}}
								>
									Sign In
								</IonButton>
							</div>
						</IonList>
					))}
			</IonContent>
		</IonPage>
	);
};

export default SyncSettings;
