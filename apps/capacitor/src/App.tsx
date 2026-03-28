import { SplashScreen } from "@capacitor/splash-screen";
import {
	IonApp,
	IonIcon,
	IonLabel,
	IonRouterOutlet,
	IonTabBar,
	IonTabButton,
	IonTabs,
	setupIonicReact,
} from "@ionic/react";
import { IonReactRouter } from "@ionic/react-router";
import { bluetooth, library, settings } from "ionicons/icons";
import type React from "react";
import { useEffect } from "react";
import { Redirect, Route } from "react-router-dom";

/* Core CSS required for Ionic components to work properly */
import "@ionic/react/css/core.css";

/* Basic CSS for apps built with Ionic */
import "@ionic/react/css/normalize.css";
import "@ionic/react/css/structure.css";
import "@ionic/react/css/typography.css";

/* Optional CSS utils that can be commented out */
import "@ionic/react/css/padding.css";
import "@ionic/react/css/float-elements.css";
import "@ionic/react/css/text-alignment.css";
import "@ionic/react/css/text-transformation.css";
import "@ionic/react/css/flex-utils.css";
import "@ionic/react/css/display.css";

/* Monochrome theme */
import "./theme/monochrome.css";

import { BLEConnectionState } from "./ble";
import { BLEProvider, useBLE } from "./contexts/BLEContext";
import { BookSyncProvider } from "./contexts/BookSyncContext";
import { DatabaseProvider } from "./contexts/DatabaseContext";
import Library from "./pages/library";
import Settings from "./pages/settings";

setupIonicReact();

/**
 * Hook that returns the BLE badge CSS class and label text.
 * Used inline inside IonTabBar since Ionic only recognises
 * literal IonTabButton children (not wrapper components).
 */
function useBLEBadge() {
	const { connectionState, connectedDevice } = useBLE();

	const isConnected = connectionState === BLEConnectionState.CONNECTED;
	const isTransitioning =
		connectionState === BLEConnectionState.CONNECTING ||
		connectionState === BLEConnectionState.DISCONNECTING;

	const label = isConnected
		? connectedDevice?.name || "Connected"
		: isTransitioning
			? "Connecting..."
			: "No device";

	const cssClass = isConnected
		? "ble-badge ble-connected"
		: isTransitioning
			? "ble-badge ble-transitioning"
			: "ble-badge ble-disconnected";

	return { label, cssClass };
}

const AppTabs: React.FC = () => {
	const { label, cssClass } = useBLEBadge();

	return (
		<IonTabs>
			<IonRouterOutlet>
				<Route exact path="/library" component={Library} />
				<Route exact path="/settings" component={Settings} />
				<Route exact path="/">
					<Redirect to="/library" />
				</Route>
			</IonRouterOutlet>
			<IonTabBar slot="bottom">
				<IonTabButton tab="library" href="/library">
					<IonIcon icon={library} />
					<IonLabel>Library</IonLabel>
				</IonTabButton>
				<IonTabButton tab="settings" href="/settings">
					<IonIcon icon={settings} />
					<IonLabel>Settings</IonLabel>
				</IonTabButton>
				<IonTabButton tab="ble-badge" href="/settings" className={cssClass}>
					<IonIcon icon={bluetooth} />
					<IonLabel>{label}</IonLabel>
				</IonTabButton>
			</IonTabBar>
		</IonTabs>
	);
};

const App: React.FC = () => {
	useEffect(() => {
		SplashScreen.hide();
	}, []);

	return (
		<IonApp>
			<DatabaseProvider>
				<BLEProvider>
					<BookSyncProvider>
						<IonReactRouter>
							<AppTabs />
						</IonReactRouter>
					</BookSyncProvider>
				</BLEProvider>
			</DatabaseProvider>
		</IonApp>
	);
};

export default App;
