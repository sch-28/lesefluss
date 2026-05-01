import {
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
import {
	bookOutline,
	chatbubbleEllipsesOutline,
	chevronForward,
	cloudDone,
	cloudOutline,
	colorPaletteOutline,
	downloadOutline,
	globeOutline,
	hardwareChipOutline,
	megaphoneOutline,
	sparklesOutline,
} from "ionicons/icons";
import type React from "react";
import { useHistory } from "react-router-dom";
import BLEIndicator from "../components/ble-indicator";
import { SHOW_WHATS_NEW_EVENT } from "../components/whats-new-modal";
import { useBLE } from "../contexts/ble-context";
import { useSyncContext } from "../contexts/sync-context";
import { useTheme } from "../contexts/theme-context";
import { BLEConnectionState } from "../services/ble";
import { queryHooks } from "../services/db/hooks";
import { SYNC_ENABLED } from "../services/sync";
import { IS_WEB } from "../utils/platform";

const TOOLBAR_END_STYLE: React.CSSProperties = { display: "flex", alignItems: "center" };
const CHEVRON_STYLE: React.CSSProperties = { fontSize: "16px" };
const SECTION_GAP_STYLE: React.CSSProperties = { height: "8px" };

type SettingsRowProps = {
	icon: string;
	iconColor?: string;
	title: string;
	subtitle: string;
	onClick?: () => void;
	routerLink?: string;
};

function SettingsRow({
	icon,
	iconColor = "medium",
	title,
	subtitle,
	onClick,
	routerLink,
}: SettingsRowProps) {
	return (
		<IonItem
			button
			detail={false}
			onClick={onClick}
			routerLink={routerLink}
			routerDirection={routerLink ? "forward" : undefined}
		>
			<IonIcon icon={icon} slot="start" color={iconColor} />
			<IonLabel>
				<h2>{title}</h2>
				<p>{subtitle}</p>
			</IonLabel>
			<IonIcon icon={chevronForward} slot="end" color="medium" style={CHEVRON_STYLE} />
		</IonItem>
	);
}

const Settings: React.FC = () => {
	const history = useHistory();
	const { data: settings, isPending } = queryHooks.useSettings();
	const { connectionState, connectedDevice } = useBLE();
	const { theme } = useTheme();
	const { isLoggedIn, userEmail } = useSyncContext();

	const isConnected = connectionState === BLEConnectionState.CONNECTED;
	const isTransitioning =
		connectionState === BLEConnectionState.CONNECTING ||
		connectionState === BLEConnectionState.DISCONNECTING;

	const showWhatsNew = () => window.dispatchEvent(new Event(SHOW_WHATS_NEW_EVENT));

	const rsvpSubtitle = settings
		? `${settings.wpm} WPM · Comma ${settings.delayComma.toFixed(1)}x · Period ${settings.delayPeriod.toFixed(1)}x`
		: "Loading...";

	const appearanceSubtitle = theme === "dark" ? "Dark" : theme === "sepia" ? "Sepia" : "Light";

	const deviceSubtitle = isConnected
		? connectedDevice?.name || "Connected"
		: isTransitioning
			? "Connecting..."
			: "No device";

	const syncSubtitle = isLoggedIn ? (userEmail ?? "Connected") : "Not signed in";

	const openFeedback = () => {
		const url = IS_WEB ? "/feedback?source=web-app" : "https://lesefluss.app/feedback?source=app";
		window.open(url, IS_WEB ? "_blank" : "_system");
	};

	const openWebsite = () => window.open("https://lesefluss.app", "_system");
	const replayOnboarding = () => history.push("/onboarding");

	if (isPending) {
		return (
			<IonPage>
				<IonContent className="ion-padding ion-text-center">
					<div className="flex h-full flex-col items-center justify-center">
						<IonSpinner />
					</div>
				</IonContent>
			</IonPage>
		);
	}

	const showDevicesAndSync = !IS_WEB || SYNC_ENABLED;

	return (
		<IonPage>
			<IonHeader class="ion-no-border">
				<IonToolbar>
					<IonTitle>Settings</IonTitle>
					{!IS_WEB && (
						<div slot="end" style={TOOLBAR_END_STYLE}>
							<BLEIndicator />
						</div>
					)}
				</IonToolbar>
			</IonHeader>
			<IonContent>
				<IonList className="ion-padding-top content-container">
					<IonListHeader>
						<IonLabel>Reading</IonLabel>
					</IonListHeader>
					<SettingsRow
						icon={bookOutline}
						title="RSVP"
						subtitle={rsvpSubtitle}
						routerLink="/tabs/settings/rsvp"
					/>
					<SettingsRow
						icon={colorPaletteOutline}
						title="Appearance"
						subtitle={appearanceSubtitle}
						routerLink="/tabs/settings/appearance"
					/>
					<SettingsRow
						icon={downloadOutline}
						title="Export highlights"
						subtitle="Markdown, CSV"
						routerLink="/tabs/settings/export"
					/>
				</IonList>

				{showDevicesAndSync && (
					<>
						<div style={SECTION_GAP_STYLE} />
						<IonList className="content-container">
							<IonListHeader>
								<IonLabel>Devices & Sync</IonLabel>
							</IonListHeader>
							{!IS_WEB && (
								<SettingsRow
									icon={hardwareChipOutline}
									title="Device"
									subtitle={deviceSubtitle}
									routerLink="/tabs/settings/device"
								/>
							)}
							{SYNC_ENABLED && (
								<SettingsRow
									icon={isLoggedIn ? cloudDone : cloudOutline}
									iconColor={isLoggedIn ? "success" : "medium"}
									title="Cloud Sync"
									subtitle={syncSubtitle}
									routerLink="/tabs/settings/sync"
								/>
							)}
						</IonList>
					</>
				)}

				<div style={SECTION_GAP_STYLE} />
				<IonList className="content-container">
					<IonListHeader>
						<IonLabel>About</IonLabel>
					</IonListHeader>
					{!IS_WEB && (
						<SettingsRow
							icon={globeOutline}
							title="Website"
							subtitle="lesefluss.app"
							onClick={openWebsite}
						/>
					)}
					<SettingsRow
						icon={megaphoneOutline}
						title="What's new"
						subtitle="See recent updates"
						onClick={showWhatsNew}
					/>
					<SettingsRow
						icon={chatbubbleEllipsesOutline}
						title="Send feedback"
						subtitle="Ideas, bugs, or rough edges"
						onClick={openFeedback}
					/>
					<SettingsRow
						icon={sparklesOutline}
						title="Show onboarding"
						subtitle="Walk through the intro again"
						onClick={replayOnboarding}
					/>
				</IonList>
			</IonContent>
		</IonPage>
	);
};

export default Settings;
