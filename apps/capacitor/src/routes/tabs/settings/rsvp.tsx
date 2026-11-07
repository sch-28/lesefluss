import { Button } from "@lesefluss/ui/button";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Gauge, Zap } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import RsvpPreview from "@/pages/settings/rsvp-preview";
import RsvpSettingsForm from "@/pages/settings/rsvp-settings-form";
import { queryHooks } from "@/services/db/hooks";

export const Route = createFileRoute("/tabs/settings/rsvp")({
	component: RsvpSettings,
});

function RsvpSettings() {
	const navigate = useNavigate();
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
			<PageHeader title="RSVP" icon={Zap} />
			<div className="mx-auto max-w-2xl space-y-4 px-4 pt-4 pb-10">
				{previewSettings && <RsvpPreview settings={previewSettings} />}
				<Button
					variant="outline"
					className="w-full"
					onClick={() => void navigate({ to: "/speed-test" })}
				>
					<Gauge className="size-4" /> Test my speed
				</Button>
				<RsvpSettingsForm />
			</div>
		</div>
	);
}
