import { SplashScreen } from "@capacitor/splash-screen";
import { createRootRoute, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/app-shell/AppShell";
import { HardwareBack } from "@/components/app-shell/hardware-back";
import ShareIntentHandler from "@/components/share-intent-handler";
import { Toaster } from "@/components/toast";
import WhatsNewModal from "@/components/whats-new-modal";
import { ImportStagingProvider } from "@/contexts/import-staging-context";
import { checkForUpdate } from "@/services/update-check";

export const Route = createRootRoute({
	component: RootLayout,
});

const FULL_SCREEN_PREFIXES = ["/onboarding", "/tabs/reader"];

function RootLayout() {
	const { pathname } = useLocation();
	const isFullScreen = FULL_SCREEN_PREFIXES.some((p) => pathname.startsWith(p));

	useEffect(() => {
		SplashScreen.hide().catch(() => {});
		void checkForUpdate();
	}, []);

	return (
		// Staging wraps the share handler: a share received while the app was
		// closed parses before any page mounts, and its confirm sheet has to have
		// somewhere to live.
		<ImportStagingProvider>
			<HardwareBack />
			<ShareIntentHandler />
			<Toaster />
			<WhatsNewModal />
			{isFullScreen ? (
				<Outlet />
			) : (
				<AppShell>
					<Outlet />
				</AppShell>
			)}
		</ImportStagingProvider>
	);
}
