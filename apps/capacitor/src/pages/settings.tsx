import {
	IonContent,
	IonHeader,
	IonIcon,
	IonItem,
	IonLabel,
	IonList,
	IonPage,
	IonSpinner,
	IonTitle,
	IonToolbar,
} from "@ionic/react";
import {
	bookOutline,
	chevronForward,
	colorPaletteOutline,
	hardwareChipOutline,
} from "ionicons/icons";
import type React from "react";
import BLEIndicator from "../components/ble-indicator";
import { useBLE } from "../contexts/ble-context";
import { useTheme } from "../contexts/theme-context";
import { BLEConnectionState } from "../services/ble";
import { queryHooks } from "../services/db/hooks";

const Settings: React.FC = () => {
	const { data: settings, isPending } = queryHooks.useSettings();
	const { connectionState, connectedDevice } = useBLE();
	const { theme } = useTheme();

	const isConnected = connectionState === BLEConnectionState.CONNECTED;
	const isTransitioning =
		connectionState === BLEConnectionState.CONNECTING ||
		connectionState === BLEConnectionState.DISCONNECTING;

	// Build subtitles
	const rsvpSubtitle = settings
		? `${settings.wpm} WPM · Comma ${settings.delayComma.toFixed(1)}x · Period ${settings.delayPeriod.toFixed(1)}x`
		: "Loading...";

	const appearanceSubtitle = theme === "dark" ? "Dark mode" : "Light mode";

	const deviceSubtitle = isConnected
		? connectedDevice?.name || "Connected"
		: isTransitioning
			? "Connecting..."
			: "No device";

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

	return (
		<IonPage>
			<IonHeader class="ion-no-border">
				<IonToolbar>
					<IonTitle>Settings</IonTitle>
					<div slot="end" style={{ display: "flex", alignItems: "center" }}>
						<BLEIndicator />
					</div>
				</IonToolbar>
			</IonHeader>
			<IonContent>
				<IonList className="ion-padding-top">
					<IonItem button detail={false} routerLink="/tabs/settings/rsvp" routerDirection="forward">
						<IonIcon icon={bookOutline} slot="start" color="medium" />
						<IonLabel>
							<h2>RSVP</h2>
							<p>{rsvpSubtitle}</p>
						</IonLabel>
						<IonIcon icon={chevronForward} slot="end" color="medium" style={{ fontSize: "16px" }} />
					</IonItem>

					<IonItem
						button
						detail={false}
						routerLink="/tabs/settings/appearance"
						routerDirection="forward"
					>
						<IonIcon icon={colorPaletteOutline} slot="start" color="medium" />
						<IonLabel>
							<h2>Appearance</h2>
							<p>{appearanceSubtitle}</p>
						</IonLabel>
						<IonIcon icon={chevronForward} slot="end" color="medium" style={{ fontSize: "16px" }} />
					</IonItem>

					<IonItem
						button
						detail={false}
						routerLink="/tabs/settings/device"
						routerDirection="forward"
					>
						<IonIcon icon={hardwareChipOutline} slot="start" color="medium" />
						<IonLabel>
							<h2>Device</h2>
							<p>{deviceSubtitle}</p>
						</IonLabel>
						<IonIcon icon={chevronForward} slot="end" color="medium" style={{ fontSize: "16px" }} />
					</IonItem>
				</IonList>
			</IonContent>
		</IonPage>
	);
};

export default Settings;
