import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	ChevronRight,
	Cloud,
	CloudCheck,
	Cog,
	Cpu,
	Download,
	Eye,
	Globe,
	Loader2,
	Megaphone,
	MessageCircle,
	Sparkles,
	Zap,
} from "lucide-react";
import { TabHeader } from "@/components/app-shell/tab-header";
import BLEIndicator from "@/components/ble-indicator";
import { SHOW_WHATS_NEW_EVENT } from "@/components/whats-new-modal";
import { useBLE } from "@/contexts/ble-context";
import { useSyncContext } from "@/contexts/sync-context";
import { useTheme } from "@/contexts/theme-context";
import { BLEConnectionState } from "@/services/ble";
import { queryHooks } from "@/services/db/hooks";
import { SYNC_ENABLED } from "@/services/sync";
import { IS_WEB } from "@/utils/platform";

export const Route = createFileRoute("/tabs/settings/")({
	component: SettingsLanding,
});

type RowProps = {
	icon: React.ComponentType<{ className?: string }>;
	title: string;
	subtitle: string;
	to?:
		| "/tabs/settings/rsvp"
		| "/tabs/settings/appearance"
		| "/tabs/settings/export"
		| "/tabs/settings/device"
		| "/tabs/settings/sync";
	onClick?: () => void;
	iconClassName?: string;
};

function Row({ icon: Icon, title, subtitle, to, onClick, iconClassName }: RowProps) {
	const content = (
		<>
			<Icon className={iconClassName ?? "size-5 text-muted-foreground"} />
			<div className="min-w-0 flex-1">
				<div className="font-medium text-foreground text-sm">{title}</div>
				<div className="text-muted-foreground text-xs">{subtitle}</div>
			</div>
			<ChevronRight className="size-4 text-muted-foreground" />
		</>
	);
	const cls =
		"flex w-full cursor-pointer items-center gap-3 bg-card px-4 py-3 text-left no-underline transition-colors hover:bg-muted/60";
	if (to) {
		return (
			<Link to={to} className={cls}>
				{content}
			</Link>
		);
	}
	return (
		<button type="button" onClick={() => onClick?.()} className={cls}>
			{content}
		</button>
	);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="mt-6 first:mt-2">
			<h2 className="px-4 pb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
				{title}
			</h2>
			<div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
				{children}
			</div>
		</section>
	);
}

function SettingsLanding() {
	const navigate = useNavigate();
	const { data: settings, isPending } = queryHooks.useSettings();
	const { connectionState, connectedDevice } = useBLE();
	const { theme } = useTheme();
	const { isLoggedIn, userEmail } = useSyncContext();

	const isConnected = connectionState === BLEConnectionState.CONNECTED;
	const isTransitioning =
		connectionState === BLEConnectionState.CONNECTING ||
		connectionState === BLEConnectionState.DISCONNECTING;

	const rsvpSubtitle = settings
		? `${settings.wpm} WPM · Comma ${settings.delayComma.toFixed(1)}x · Period ${settings.delayPeriod.toFixed(1)}x`
		: "Loading...";
	const appearanceSubtitle = theme === "dark" ? "Dark" : theme === "sepia" ? "Sepia" : "Light";
	const deviceSubtitle = isConnected
		? connectedDevice?.name || "Connected"
		: isTransitioning
			? "Connecting..."
			: "No device";
	const syncSubtitle = isLoggedIn ? (userEmail ?? "Connected") : "Not signed in";

	const showWhatsNew = () => window.dispatchEvent(new Event(SHOW_WHATS_NEW_EVENT));
	const openFeedback = () => {
		const url = IS_WEB ? "/feedback?source=web-app" : "https://lesefluss.app/feedback?source=app";
		window.open(url, IS_WEB ? "_blank" : "_system");
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
				<Section title="Reading">
					<Row icon={Zap} title="RSVP" subtitle={rsvpSubtitle} to="/tabs/settings/rsvp" />
					<Row
						icon={Eye}
						title="Appearance"
						subtitle={appearanceSubtitle}
						to="/tabs/settings/appearance"
					/>
					<Row
						icon={Download}
						title="Export highlights"
						subtitle="Markdown, CSV"
						to="/tabs/settings/export"
					/>
				</Section>

				{showDevicesAndSync && (
					<Section title="Devices & sync">
						{!IS_WEB && (
							<Row icon={Cpu} title="Device" subtitle={deviceSubtitle} to="/tabs/settings/device" />
						)}
						{SYNC_ENABLED && (
							<Row
								icon={isLoggedIn ? CloudCheck : Cloud}
								iconClassName={
									isLoggedIn ? "size-5 text-emerald-500" : "size-5 text-muted-foreground"
								}
								title="Cloud sync"
								subtitle={syncSubtitle}
								to="/tabs/settings/sync"
							/>
						)}
					</Section>
				)}

				<Section title="About">
					{!IS_WEB && (
						<Row icon={Globe} title="Website" subtitle="lesefluss.app" onClick={openWebsite} />
					)}
					<Row
						icon={Megaphone}
						title="What's new"
						subtitle="See recent updates"
						onClick={showWhatsNew}
					/>
					<Row
						icon={MessageCircle}
						title="Send feedback"
						subtitle="Ideas, bugs, or rough edges"
						onClick={openFeedback}
					/>
					<Row
						icon={Sparkles}
						title="Show onboarding"
						subtitle="Walk through the intro again"
						onClick={replayOnboarding}
					/>
				</Section>
			</div>
		</div>
	);
}
