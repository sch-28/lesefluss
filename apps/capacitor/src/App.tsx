import { App as CapacitorApp } from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";
import {
	createAnimation,
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
import { library, searchOutline, settings } from "ionicons/icons";
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

import DesktopSidebar from "./components/desktop-sidebar";
import ShareIntentHandler from "./components/share-intent-handler";
import { BLEProvider } from "./contexts/ble-context";
import { BookSyncProvider } from "./contexts/book-sync-context";
import { DatabaseProvider } from "./contexts/database-context";
import { SyncProvider } from "./contexts/sync-context";
import { ThemeProvider } from "./contexts/theme-context";
import Explore from "./pages/explore";
import ExploreBookDetail from "./pages/explore/book-detail";
import Library from "./pages/library";
import LibraryBookDetail from "./pages/library/book-detail";
import Onboarding from "./pages/onboarding";
import BookReader from "./pages/reader";
import Settings from "./pages/settings";
import AppearanceSettings from "./pages/settings/appearance";
import DeviceSettings from "./pages/settings/device";
import RSVPSettings from "./pages/settings/rsvp";
import SyncSettings from "./pages/settings/sync";
import { queryHooks } from "./services/db/hooks";
import { queryClient } from "./services/query-client";

interface SlideAnimationOpts {
	enteringEl: HTMLElement;
	leavingEl: HTMLElement;
	direction: string;
}

const slideAnimation = (_: HTMLElement, opts: SlideAnimationOpts) => {
	const DURATION = 300;
	const EASING = "cubic-bezier(0.32, 0.72, 0, 1)";
	const { enteringEl, leavingEl } = opts;
	const isGoingBack = opts.direction === "back";

	const enterFrom = isGoingBack ? "-30%" : "100%";
	const leaveTo = isGoingBack ? "100%" : "-30%";

	const enterAnim = createAnimation()
		.addElement(enteringEl)
		.duration(DURATION)
		.easing(EASING)
		.fromTo("transform", `translateX(${enterFrom})`, "translateX(0)")
		.fromTo("opacity", isGoingBack ? "1" : "0.6", "1");

	const leaveAnim = createAnimation()
		.addElement(leavingEl)
		.duration(DURATION)
		.easing(EASING)
		.fromTo("transform", "translateX(0)", `translateX(${leaveTo})`)
		.fromTo("opacity", "1", isGoingBack ? "0.6" : "1");

	return createAnimation().addAnimation([enterAnim, leaveAnim]);
};

setupIonicReact({
	mode: "md",
	animated: true,
	navAnimation: slideAnimation,
});

const BASENAME = import.meta.env.VITE_WEB_BUILD ? "/app" : "";

const AppTabs: React.FC = () => {
	const ionRouter = useIonRouter();
	const location = useLocation();
	const isSubPage = (path: string) =>
		path.startsWith("/tabs/reader/") ||
		path.startsWith("/tabs/library/book/") ||
		path.startsWith("/tabs/explore/book/") ||
		(path.startsWith("/tabs/settings/") && path !== "/tabs/settings");
	const hideTabBar = isSubPage(ionRouter.routeInfo.pathname) || isSubPage(location.pathname);

	return (
		<IonTabs>
			<IonRouterOutlet>
				<Route exact path="/tabs/library" component={Library} />
				<Route exact path="/tabs/library/book/:id" component={LibraryBookDetail} />
				<Route exact path="/tabs/explore" component={Explore} />
				<Route exact path="/tabs/explore/book/:catalogId" component={ExploreBookDetail} />
				<Route exact path="/tabs/settings" component={Settings} />
				<Route exact path="/tabs/settings/rsvp" component={RSVPSettings} />
				<Route exact path="/tabs/settings/appearance" component={AppearanceSettings} />
				<Route exact path="/tabs/settings/device" component={DeviceSettings} />
				<Route exact path="/tabs/settings/sync" component={SyncSettings} />
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
				<IonTabButton
					tab="explore"
					href="/tabs/explore"
					onClick={() => {
						// Tapping the Explore tab while already on /tabs/explore should take
						// the user back to the landing — clear the query input and strip any
						// ?genre=… filter. Broadcast to Explore since the search state lives
						// there.
						if (location.pathname.startsWith("/tabs/explore")) {
							window.dispatchEvent(new Event("lesefluss:explore-reset"));
						}
					}}
				>
					<IonIcon icon={searchOutline} />
					<IonLabel>Explore</IonLabel>
				</IonTabButton>
				<IonTabButton tab="settings" href="/tabs/settings">
					<IonIcon icon={settings} />
					<IonLabel>Settings</IonLabel>
				</IonTabButton>
			</IonTabBar>
		</IonTabs>
	);
};

/**
 * Registers exit-app behaviour on the hardware back button via Ionic's
 * ionBackButton event system.  Ionic already handles normal back-navigation
 * at priority 0 - we only need to handle the "nothing left to pop" case
 * at a lower priority (-1) to exit the app.
 *
 * IMPORTANT: Do NOT use CapacitorApp.addListener("backButton") directly -
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

/**
 * Picks the initial destination based on whether first-run onboarding has
 * completed. Rendered at the root route so the app lands on /onboarding the
 * first time and /tabs/library thereafter.
 */
const RootRedirect: React.FC = () => {
	const { data: settings, isPending } = queryHooks.useSettings();
	if (isPending || !settings) return null;
	return <Redirect to={settings.onboardingCompleted ? "/tabs/library" : "/onboarding"} />;
};

const App: React.FC = () => {
	useEffect(() => {
		SplashScreen.hide();
	}, []);

	return (
		<IonApp>
			<QueryClientProvider client={queryClient}>
				<DatabaseProvider>
					<SyncProvider>
						<ThemeProvider>
							<BLEProvider>
								<BookSyncProvider>
									<IonReactRouter basename={BASENAME || undefined}>
										<HardwareBackButtonHandler />
										<ShareIntentHandler />
										<DesktopSidebar />
										<IonRouterOutlet className="desktop-main">
											{/* All other routes under /tabs share the tab bar */}
											<Route path="/tabs" render={() => <AppTabs />} />
											<Route exact path="/onboarding" component={Onboarding} />

											{/* Root redirect - gated on onboarding completion */}
											<Route exact path="/" component={RootRedirect} />
										</IonRouterOutlet>
									</IonReactRouter>
								</BookSyncProvider>
							</BLEProvider>
						</ThemeProvider>
					</SyncProvider>
				</DatabaseProvider>
			</QueryClientProvider>
		</IonApp>
	);
};

export default App;
