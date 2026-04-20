import { Browser } from "@capacitor/browser";
import {
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
	IonToolbar,
} from "@ionic/react";
import { cloudDone, cloudOutline, logOutOutline, syncOutline } from "ionicons/icons";
import type React from "react";
import { useSyncContext } from "../../contexts/sync-context";
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

const SyncSettings: React.FC = () => {
	const { isLoggedIn, userEmail, isSyncing, lastSynced, syncError, logout, syncNow } =
		useSyncContext();

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
				{isLoggedIn ? (
					<IonList className="content-container">
						<IonListHeader>
							<IonLabel>Account</IonLabel>
						</IonListHeader>
						<IonItem>
							<IonIcon icon={cloudDone} slot="start" color="success" />
							<IonLabel>
								<h2>{userEmail}</h2>
								<p>Last synced: {formatLastSynced(lastSynced)}</p>
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

						{!IS_WEB_BUILD && (
							<IonItem button onClick={logout} detail={false}>
								<IonIcon icon={logOutOutline} slot="start" color="danger" />
								<IonLabel color="danger">Sign Out</IonLabel>
							</IonItem>
						)}
					</IonList>
				) : IS_WEB_BUILD ? (
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
				)}
			</IonContent>
		</IonPage>
	);
};

export default SyncSettings;
