import { SplashScreen } from "@capacitor/splash-screen";
import { createRootRoute, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useCommandDispatcher } from "@/commands/dispatcher";
import { useGlobalCommands } from "@/commands/global";
import { AppShell } from "@/components/app-shell/AppShell";
import { HardwareBack } from "@/components/app-shell/hardware-back";
import CommandPalette from "@/components/command-palette";
import { PushOfferDialog } from "@/components/push/push-offer-dialog";
import { SessionSummarySheet } from "@/components/session-summary/session-summary-sheet";
import ShareIntentHandler from "@/components/share-intent-handler";
import ShortcutSheet from "@/components/shortcut-sheet";
import { Toaster } from "@/components/toast";
import WhatsNewModal from "@/components/whats-new-modal";
import { ImportStagingProvider } from "@/contexts/import-staging-context";
import { isDarkTheme, useTheme } from "@/contexts/theme-context";
import { BurstHost } from "@/pages/burst/burst-host";
import { useDeepLinks } from "@/services/deep-links/use-deep-links";
import { useEinkSuggestion } from "@/services/eink-suggestion/use-eink-suggestion";
import { useGoalReminders } from "@/services/goal-reminders/use-goal-reminders";
import { usePushNotifications } from "@/services/push/use-push-notifications";
import { checkForUpdate } from "@/services/update-check";

export const Route = createRootRoute({
	component: RootLayout,
});

const FULL_SCREEN_PREFIXES = ["/onboarding", "/tabs/reader"];

function RootLayout() {
	const { pathname } = useLocation();
	const isFullScreen = FULL_SCREEN_PREFIXES.some((p) => pathname.startsWith(p));
	const { theme } = useTheme();
	useDeepLinks();
	usePushNotifications();
	useGoalReminders();
	useEinkSuggestion();
	// Here, not in AppShell: the reader renders without it and must not get a second listener.
	useCommandDispatcher();
	useGlobalCommands();

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
			<Toaster dark={isDarkTheme(theme)} />
			<WhatsNewModal />
			<PushOfferDialog />
			<CommandPalette />
			<ShortcutSheet />
			<BurstHost />
			<SessionSummarySheet />
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
