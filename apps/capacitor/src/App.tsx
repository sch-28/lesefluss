import {
	IonApp,
	IonRouterOutlet,
	IonTabBar,
	IonTabButton,
	IonTabs,
	IonIcon,
	IonLabel,
	setupIonicReact,
} from "@ionic/react";
import { IonReactRouter } from "@ionic/react-router";
import type React from "react";
import { useEffect } from "react";
import { Redirect, Route } from "react-router-dom";
import { SplashScreen } from "@capacitor/splash-screen";
import { settings, reader } from "ionicons/icons";

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

import Settings from "./pages/Settings";
import Home from "./pages/Home";
import { DatabaseProvider } from "./contexts/DatabaseContext";
import { BLEProvider } from "./contexts/BLEContext";

setupIonicReact();

const App: React.FC = () => {
	useEffect(() => {
		// Hide splash screen when app is ready
		SplashScreen.hide();
	}, []);

	return (
		<IonApp>
			<DatabaseProvider>
				<BLEProvider>
					<IonReactRouter>
						<IonTabs>
							<IonRouterOutlet>
								<Route exact path="/home" component={Home} />
								<Route exact path="/settings" component={Settings} />
								<Route exact path="/">
									<Redirect to="/home" />
								</Route>
							</IonRouterOutlet>
							<IonTabBar slot="bottom">
								<IonTabButton tab="home" href="/home">
									<IonIcon icon={reader} />
									<IonLabel>Reader</IonLabel>
								</IonTabButton>
								<IonTabButton tab="settings" href="/settings">
									<IonIcon icon={settings} />
									<IonLabel>Settings</IonLabel>
								</IonTabButton>
							</IonTabBar>
						</IonTabs>
					</IonReactRouter>
				</BLEProvider>
			</DatabaseProvider>
		</IonApp>
	);
};

export default App;
