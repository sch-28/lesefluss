import { createFileRoute } from "@tanstack/react-router";
import { Zap } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
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
		<div className="min-h-screen bg-background">
			<PageHeader title="RSVP" icon={Zap} />
			<div className="mx-auto max-w-2xl space-y-4 px-4 pb-10 pt-4">
				{previewSettings && <RsvpPreview settings={previewSettings} />}
				<RsvpSettingsForm />
			</div>
		</div>
	);
}
