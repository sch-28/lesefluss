import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { ToggleRow } from "@/components/app-shell/toggle-row";
import { SettingsSection } from "@/components/settings/settings-section";
import { DiagnosticsRow } from "@/pages/settings/diagnostics-row";
import { isTelemetryEnabled, setTelemetryEnabled } from "@/services/telemetry";

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
					<ToggleRow
						id="telemetry"
						title="Anonymous diagnostics"
						subtitle="Send anonymized error reports to help fix bugs. No account or personal data."
						checked={telemetry}
						onCheckedChange={toggle}
					/>
				</SettingsSection>
				<SettingsSection title="This device">
					<DiagnosticsRow />
				</SettingsSection>
			</div>
		</div>
	);
}
