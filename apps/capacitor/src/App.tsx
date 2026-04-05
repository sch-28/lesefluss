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
	useIonRouter,
} from "@ionic/react";
import { IonReactRouter } from "@ionic/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
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
import { ThemeProvider } from "./contexts/theme-context";
import Library from "./pages/library";
import BookReader from "./pages/reader";
import Settings from "./pages/settings";
import { BLEConnectionState } from "./services/ble";
import { queryClient } from "./services/query-client";

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
	const ionRouter = useIonRouter();
	const location = useLocation();
	const hideTabBar =
		ionRouter.routeInfo.pathname.startsWith("/tabs/reader/") ||
		location.pathname.startsWith("/tabs/reader/");

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
				<IonTabButton tab="ble-badge" disabled className={cssClass}>
					<IonIcon icon={bluetooth} />
					<IonLabel>{label}</IonLabel>
				</IonTabButton>
			</IonTabBar>
		</IonTabs>
	);
};

/**
 * Registers exit-app behaviour on the hardware back button via Ionic's
 * ionBackButton event system.  Ionic already handles normal back-navigation
 * at priority 0 — we only need to handle the "nothing left to pop" case
 * at a lower priority (-1) to exit the app.
 *
 * IMPORTANT: Do NOT use CapacitorApp.addListener("backButton") directly —
 * that fires at the Capacitor level *before* Ionic's event system and
 * causes a double-pop (swipe back + history.back() = two pops).
 */
const HardwareBackButtonHandler: React.FC = () => {
	const ionRouter = useIonRouter();

	useEffect(() => {
		const handler = (
			event: CustomEvent<{
				register: (priority: number, handler: (processNextHandler: () => void) => void) => void;
			}>,
		) => {
			event.detail.register(-1, () => {
				if (!ionRouter.canGoBack()) {
					CapacitorApp.exitApp();
				}
			});
		};

		document.addEventListener("ionBackButton", handler as EventListener);
		return () => {
			document.removeEventListener("ionBackButton", handler as EventListener);
		};
	}, [ionRouter]);

	return null;
};

const App: React.FC = () => {
	useEffect(() => {
		SplashScreen.hide();
	}, []);

	return (
		<ThemeProvider>
			<IonApp>
				<QueryClientProvider client={queryClient}>
					<DatabaseProvider>
						<BLEProvider>
							<BookSyncProvider>
								<IonReactRouter>
									<HardwareBackButtonHandler />
									<IonRouterOutlet>
										{/* All other routes under /tabs share the tab bar */}
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
				</QueryClientProvider>
			</IonApp>
		</ThemeProvider>
	);
};

export default App;
