import { createFileRoute } from "@tanstack/react-router";
import { Zap } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/page-container";
import { SpeedTestButton } from "@/components/speed-test-button";
import RsvpPreview from "@/pages/settings/rsvp-preview";
import RsvpSettingsForm from "@/pages/settings/rsvp-settings-form";
import { queryHooks } from "@/services/db/hooks";

export const Route = createFileRoute("/tabs/settings/rsvp")({
	component: RsvpSettings,
});

function RsvpSettings() {
	const { data: settings } = queryHooks.useSettings();
	const previewSettings = settings
		? {
				wpm: settings.wpm,
				delayComma: settings.delayComma,
				delayPeriod: settings.delayPeriod,
				accelStart: settings.accelStart,
				accelRate: settings.accelRate,
				xOffset: settings.xOffset,
				focalLetterColor: settings.focalLetterColor,
			}
		: null;

	return (
		<div className="bg-background">
			<PageHeader width="text" title="RSVP" icon={Zap} />
			<PageContainer width="text" className="px-4 pt-4 pb-10">
				{previewSettings && <RsvpPreview settings={previewSettings} />}
				<SpeedTestButton className="mt-4 first:mt-0" />
				<RsvpSettingsForm />
			</PageContainer>
		</div>
	);
}
