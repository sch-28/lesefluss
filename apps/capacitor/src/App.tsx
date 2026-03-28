import { App as CapacitorApp } from "@capacitor/app";
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
import { Redirect, Route, useLocation } from "react-router-dom";

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

import { BLEProvider, useBLE } from "./contexts/ble-context";
import { BookSyncProvider } from "./contexts/book-sync-context";
import { DatabaseProvider } from "./contexts/database-context";
import Library from "./pages/library";
import BookReader from "./pages/reader";
import Settings from "./pages/settings";
import { BLEConnectionState } from "./services/ble";

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
	const location = useLocation();
	const hideTabBar = location.pathname.startsWith("/tabs/reader/");

	return (
		<IonTabs>
			<IonRouterOutlet>
				<Route exact path="/tabs/library" component={Library} />
				<Route exact path="/tabs/settings" component={Settings} />
				<Route exact path="/tabs/reader/:id" component={BookReader} />
				<Route exact path="/tabs">
					<Redirect to="/tabs/library" />
				</Route>
			</IonRouterOutlet>
			<IonTabBar slot="bottom" className={hideTabBar ? "tab-bar-hidden" : ""}>
				<IonTabButton tab="library" href="/tabs/library">
					<IonIcon icon={library} />
					<IonLabel>Library</IonLabel>
				</IonTabButton>
				<IonTabButton tab="settings" href="/tabs/settings">
					<IonIcon icon={settings} />
					<IonLabel>Settings</IonLabel>
				</IonTabButton>
				<IonTabButton tab="ble-badge" href="/tabs/settings" className={cssClass}>
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

		// Android hardware back button: go back if possible, otherwise exit.
		// This runs at the native Capacitor level — without it the back button
		// bypasses Ionic's router and immediately closes the Activity.
		CapacitorApp.addListener("backButton", ({ canGoBack }) => {
			if (canGoBack) {
				window.history.back();
			} else {
				CapacitorApp.exitApp();
			}
		});

		return () => {
			CapacitorApp.removeAllListeners();
		};
	}, []);

	return (
		<IonApp>
			<DatabaseProvider>
				<BLEProvider>
					<BookSyncProvider>
						<IonReactRouter>
							<IonRouterOutlet>
								{/* All routes under /tabs — reader included so it shares the nav stack */}
								<Route path="/tabs" render={() => <AppTabs />} />

								{/* Root redirect */}
								<Route exact path="/">
									<Redirect to="/tabs/library" />
								</Route>
							</IonRouterOutlet>
						</IonReactRouter>
					</BookSyncProvider>
				</BLEProvider>
			</DatabaseProvider>
		</IonApp>
	);
};

export default App;
