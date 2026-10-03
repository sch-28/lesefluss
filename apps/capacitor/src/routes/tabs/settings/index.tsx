import { Capacitor } from "@capacitor/core";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
	BookOpen,
	Cloud,
	CloudCheck,
	Cog,
	Cpu,
	Download,
	Globe,
	Loader2,
	Megaphone,
	MessageCircle,
	SlidersHorizontal,
	Sparkles,
	Users,
	Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { TabHeader } from "@/components/app-shell/tab-header";
import { ToggleRow } from "@/components/app-shell/toggle-row";
import BLEIndicator from "@/components/ble-indicator";
import { NavRow } from "@/components/settings/settings-row";
import { SettingsSection } from "@/components/settings/settings-section";
import { SHOW_WHATS_NEW_EVENT } from "@/components/whats-new-modal";
import { useBLE } from "@/contexts/ble-context";
import { useSyncContext } from "@/contexts/sync-context";
import { useTheme } from "@/contexts/theme-context";
import { FONT_FAMILIES, THEMES } from "@/hooks/use-appearance-settings";
import { DiagnosticsRow } from "@/pages/settings/diagnostics-row";
import { BLEConnectionState } from "@/services/ble";
import { queryHooks } from "@/services/db/hooks";
import { SYNC_ENABLED } from "@/services/sync";
import {
	type DeviceDiagnostics,
	getDeviceDiagnostics,
	isTelemetryEnabled,
	setTelemetryEnabled,
} from "@/services/telemetry";
import { IS_WEB } from "@/utils/platform";

export const Route = createFileRoute("/tabs/settings/")({
	component: SettingsLanding,
});

function SettingsLanding() {
	const navigate = useNavigate();
	const { data: settings, isPending } = queryHooks.useSettings();
	const { connectionState, connectedDevice } = useBLE();
	const { theme } = useTheme();
	const { isLoggedIn, userEmail } = useSyncContext();
	const [telemetry, setTelemetry] = useState(isTelemetryEnabled());
	const [diagnostics, setDiagnostics] = useState<DeviceDiagnostics | null>(null);

	useEffect(() => {
		getDeviceDiagnostics()
			.then(setDiagnostics)
			.catch(() => {});
	}, []);

	const toggleTelemetry = (value: boolean) => {
		setTelemetryEnabled(value);
		setTelemetry(value);
	};

	const isConnected = connectionState === BLEConnectionState.CONNECTED;
	const isTransitioning =
		connectionState === BLEConnectionState.CONNECTING ||
		connectionState === BLEConnectionState.DISCONNECTING;

	const rsvpSubtitle = settings
		? `${settings.wpm} WPM · Comma ${settings.delayComma.toFixed(1)}x · Period ${settings.delayPeriod.toFixed(1)}x`
		: "Loading...";
	const themeLabel = THEMES.find((t) => t.value === theme)?.label ?? theme;
	const readerSubtitle = settings
		? `${FONT_FAMILIES.find((f) => f.value === settings.readerFontFamily)?.label ?? "Sans"} · ${settings.readerFontSize}px · ${settings.paginationStyle === "page" ? "Page" : "Scroll"}`
		: "Loading...";
	const deviceSubtitle = isConnected
		? connectedDevice?.name || "Connected"
		: isTransitioning
			? "Connecting..."
			: "No device";
	const syncSubtitle = isLoggedIn ? (userEmail ?? "Connected") : "Not signed in";

	const showWhatsNew = () => window.dispatchEvent(new Event(SHOW_WHATS_NEW_EVENT));
	const openFeedback = () => {
		const params = new URLSearchParams({
			source: IS_WEB ? "web-app" : "app",
			platform: Capacitor.getPlatform(),
			account: isLoggedIn ? "signed" : "none",
		});
		if (diagnostics?.version) params.set("v", diagnostics.version);
		if (diagnostics?.os) params.set("os", diagnostics.os);
		if (diagnostics?.webview) params.set("wv", diagnostics.webview);
		const base = IS_WEB ? "/feedback" : "https://lesefluss.app/feedback";
		window.open(`${base}?${params.toString()}`, IS_WEB ? "_blank" : "_system");
	};
	const openWebsite = () => window.open("https://lesefluss.app", "_system");
	const replayOnboarding = () => navigate({ to: "/onboarding" });

	const showDevicesAndSync = !IS_WEB || SYNC_ENABLED;

	if (isPending) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background">
				<Loader2 className="size-6 animate-spin text-muted-foreground" />
			</div>
		);
	}

	return (
		<div className="bg-background">
			<TabHeader title="Settings" icon={Cog} right={!IS_WEB && <BLEIndicator />} />
			<div className="mx-auto max-w-2xl px-4 pb-10">
				<SettingsSection title="Reading">
					<NavRow
						icon={BookOpen}
						title="Reader"
						subtitle={readerSubtitle}
						to="/tabs/settings/reader"
					/>
					<NavRow icon={Zap} title="RSVP" subtitle={rsvpSubtitle} to="/tabs/settings/rsvp" />
					<NavRow
						icon={Download}
						title="Export highlights"
						subtitle="Markdown, CSV"
						to="/tabs/settings/export"
					/>
				</SettingsSection>

				<SettingsSection title="App">
					<NavRow
						icon={SlidersHorizontal}
						title="General"
						subtitle={`${themeLabel} theme · Startup · Reading mode`}
						to="/tabs/settings/general"
					/>
				</SettingsSection>

				{showDevicesAndSync && (
					<SettingsSection title="Devices & sync">
						{!IS_WEB && (
							<NavRow
								icon={Cpu}
								title="Device"
								subtitle={deviceSubtitle}
								to="/tabs/settings/device"
							/>
						)}
						{SYNC_ENABLED && (
							<NavRow
								icon={isLoggedIn ? CloudCheck : Cloud}
								iconClassName={
									isLoggedIn ? "size-5 text-emerald-500" : "size-5 text-muted-foreground"
								}
								title="Cloud sync"
								subtitle={syncSubtitle}
								to="/tabs/settings/sync"
							/>
						)}
					</SettingsSection>
				)}

				{SYNC_ENABLED && isLoggedIn && (
					<SettingsSection title="Social">
						<NavRow
							icon={Users}
							title="Social profile"
							subtitle="Handle, avatar and who sees what"
							to="/tabs/settings/social"
						/>
					</SettingsSection>
				)}

				<SettingsSection title="About">
					{!IS_WEB && (
						<NavRow icon={Globe} title="Website" subtitle="lesefluss.app" onClick={openWebsite} />
					)}
					<NavRow
						icon={Megaphone}
						title="What's new"
						subtitle="See recent updates"
						onClick={showWhatsNew}
					/>
					<NavRow
						icon={MessageCircle}
						title="Send feedback"
						subtitle="Ideas, bugs, or rough edges"
						onClick={openFeedback}
					/>
					<NavRow
						icon={Sparkles}
						title="Show onboarding"
						subtitle="Walk through the intro again"
						onClick={replayOnboarding}
					/>
					<DiagnosticsRow />
				</SettingsSection>

				<SettingsSection title="Privacy">
					<ToggleRow
						id="telemetry"
						title="Anonymous diagnostics"
						subtitle="Send anonymized error reports to help fix bugs. No account or personal data."
						checked={telemetry}
						onCheckedChange={toggleTelemetry}
					/>
				</SettingsSection>
			</div>
		</div>
	);
}
