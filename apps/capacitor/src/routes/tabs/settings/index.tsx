import { Capacitor } from "@capacitor/core";
import { DEFAULT_SETTINGS } from "@lesefluss/core";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
	Bell,
	BookOpen,
	Cloud,
	CloudCheck,
	Cog,
	Cpu,
	Download,
	Gauge,
	Globe,
	Headphones,
	Loader2,
	Megaphone,
	MessageCircle,
	Scale,
	ShieldCheck,
	SlidersHorizontal,
	Sparkles,
	Target,
	Users,
	Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { TabHeader } from "@/components/app-shell/tab-header";
import BLEIndicator from "@/components/ble-indicator";
import { NavRow } from "@/components/settings/settings-row";
import { SettingsSection } from "@/components/settings/settings-section";
import { WINDOW_LABELS } from "@/components/speed-chip/speed-chip-model";
import { OnTheWebCard } from "@/components/web-limitations";
import { SHOW_WHATS_NEW_EVENT } from "@/components/whats-new-modal";
import { useBLE } from "@/contexts/ble-context";
import { useSyncContext } from "@/contexts/sync-context";
import { useTheme } from "@/contexts/theme-context";
import { FONT_FAMILIES, THEMES, useAppearanceSettings } from "@/hooks/use-appearance-settings";
import { BLEConnectionState } from "@/services/ble";
import { queryHooks } from "@/services/db/hooks";
import { isPushSupported } from "@/services/push";
import { SYNC_ENABLED } from "@/services/sync";
import {
	type DeviceDiagnostics,
	getDeviceDiagnostics,
	isTelemetryEnabled,
} from "@/services/telemetry";
import { IS_READ_ALOUD_SUPPORTED } from "@/services/tts";
import { openLink } from "@/utils/open-link";
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
	const [diagnostics, setDiagnostics] = useState<DeviceDiagnostics | null>(null);

	useEffect(() => {
		getDeviceDiagnostics()
			.then(setDiagnostics)
			.catch(() => {});
	}, []);

	const { paginationStyle } = useAppearanceSettings();

	const isConnected = connectionState === BLEConnectionState.CONNECTED;
	const isTransitioning =
		connectionState === BLEConnectionState.CONNECTING ||
		connectionState === BLEConnectionState.DISCONNECTING;

	const rsvpSubtitle = settings
		? `${settings.wpm} wpm · Comma ${settings.delayComma.toFixed(1)}× · Period ${settings.delayPeriod.toFixed(1)}×`
		: "Loading...";
	const themeLabel = THEMES.find((t) => t.value === theme)?.label ?? theme;
	const readerSubtitle = settings
		? `${FONT_FAMILIES.find((f) => f.value === settings.readerFontFamily)?.label ?? "Sans"} · ${settings.readerFontSize}px · ${paginationStyle === "page" ? "Page" : "Scroll"}`
		: "Loading...";
	const deviceSubtitle = isConnected
		? connectedDevice?.name || "Connected"
		: isTransitioning
			? "Connecting..."
			: "No device";
	const syncSubtitle = isLoggedIn
		? (userEmail ?? "Connected")
		: "Not signed in · Delete local data";

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
		openLink(`${base}?${params.toString()}`, { nativeTarget: "system" });
	};
	const openWebsite = () => openLink("https://lesefluss.app", { nativeTarget: "system" });
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
						icon={Target}
						title="Goals"
						subtitle="Daily goals · Reminders"
						to="/tabs/settings/goals"
					/>
					{IS_READ_ALOUD_SUPPORTED && (
						<NavRow
							icon={Headphones}
							title="Listen"
							subtitle={`${settings?.ttsWpm ?? DEFAULT_SETTINGS.TTS_WPM} wpm · Voices`}
							to="/tabs/settings/read-aloud"
						/>
					)}
					<NavRow
						icon={Gauge}
						title="Speed & estimates"
						subtitle={WINDOW_LABELS[settings?.speedWindow ?? DEFAULT_SETTINGS.SPEED_WINDOW]}
						to="/tabs/settings/speed"
					/>
				</SettingsSection>

				<SettingsSection title="Data">
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

				{SYNC_ENABLED && (
					<SettingsSection title="Social">
						<NavRow
							icon={Users}
							title="Social profile"
							subtitle={
								isLoggedIn ? "Handle, avatar and who sees what" : "Sign in to read with friends"
							}
							to="/tabs/settings/social"
						/>
						{isPushSupported() && (
							<NavRow
								icon={Bell}
								title="Notifications"
								subtitle="What friends can notify you about"
								to="/tabs/settings/notifications"
							/>
						)}
					</SettingsSection>
				)}

				<SettingsSection title="Privacy">
					{IS_WEB ? (
						<NavRow
							icon={ShieldCheck}
							title="Diagnostics"
							subtitle="Nothing is sent from the web app"
							to="/tabs/settings/diagnostics"
						/>
					) : (
						<NavRow
							icon={ShieldCheck}
							title="Anonymous diagnostics"
							subtitle={isTelemetryEnabled() ? "On" : "Off"}
							to="/tabs/settings/diagnostics"
						/>
					)}
				</SettingsSection>

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
					<NavRow
						icon={Scale}
						title="Open source licenses"
						subtitle="Fonts bundled with the reader"
						to="/tabs/settings/licenses"
					/>
				</SettingsSection>

				{IS_WEB && <OnTheWebCard />}
			</div>
		</div>
	);
}
