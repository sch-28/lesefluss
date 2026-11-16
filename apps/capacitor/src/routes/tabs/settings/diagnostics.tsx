import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { ToggleRow } from "@/components/app-shell/toggle-row";
import { SettingsSection } from "@/components/settings/settings-section";
import { DiagnosticsRow } from "@/pages/settings/diagnostics-row";
import { isTelemetryEnabled, setTelemetryEnabled } from "@/services/telemetry";
import { IS_WEB } from "@/utils/platform";

export const Route = createFileRoute("/tabs/settings/diagnostics")({
	component: DiagnosticsSettings,
});

function DiagnosticsSettings() {
	const [telemetry, setTelemetry] = useState(isTelemetryEnabled());
	const toggle = (value: boolean) => {
		setTelemetryEnabled(value);
		setTelemetry(value);
	};
	return (
		<div className="bg-background">
			<PageHeader title="Diagnostics" icon={ShieldCheck} />
			<div className="mx-auto max-w-2xl px-4 pt-4 pb-10">
				<SettingsSection title="Privacy">
					{IS_WEB ? (
						<p className="m-0 px-4 py-3 text-muted-foreground text-sm">
							The web app sends no diagnostics. Copy the device details below into a bug report if
							you want to share them.
						</p>
					) : (
						<ToggleRow
							id="telemetry"
							title="Anonymous diagnostics"
							subtitle="Off unless you turn it on. Error reports carry the error and its technical details, the platform, the app, OS and WebView version and a random id new each launch. Never your account, books or notes."
							checked={telemetry}
							onCheckedChange={toggle}
						/>
					)}
				</SettingsSection>
				<SettingsSection title="This device">
					<DiagnosticsRow />
				</SettingsSection>
			</div>
		</div>
	);
}
