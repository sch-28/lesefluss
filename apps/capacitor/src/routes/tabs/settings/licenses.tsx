import { createFileRoute } from "@tanstack/react-router";
import { Scale } from "lucide-react";
import { useState } from "react";
import atkinsonLicense from "@/assets/licenses/fonts/atkinson-hyperlegible-OFL.txt?raw";
import literataLicense from "@/assets/licenses/fonts/literata-OFL.txt?raw";
import openDyslexicLicense from "@/assets/licenses/fonts/opendyslexic-OFL.txt?raw";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageBody } from "@/components/page-body";
import { ExpanderRow } from "@/components/settings/settings-row";
import { SettingsSection } from "@/components/settings/settings-section";

export const Route = createFileRoute("/tabs/settings/licenses")({
	component: Licenses,
});

// Bundled with the app (not fetched), so the notices read offline.
const NOTICES = [
	{ title: "Atkinson Hyperlegible", license: atkinsonLicense },
	{ title: "OpenDyslexic", license: openDyslexicLicense },
	{ title: "Literata", license: literataLicense },
];

function Licenses() {
	return (
		<div className="bg-background">
			<PageHeader width="text" title="Open source licenses" icon={Scale} />
			<PageBody width="text">
				<SettingsSection title="Reader fonts">
					{NOTICES.map(({ title, license }) => (
						<LicenseNotice key={title} title={title} license={license} />
					))}
				</SettingsSection>
			</PageBody>
		</div>
	);
}

function LicenseNotice({ title, license }: { title: string; license: string }) {
	const [open, setOpen] = useState(false);
	return (
		<div className="border-border border-b last:border-b-0">
			<ExpanderRow title={title} open={open} onToggle={() => setOpen((o) => !o)} />
			{open && (
				<pre className="mx-4 mt-0 mb-3 whitespace-pre-wrap break-words font-mono text-muted-foreground text-xs">
					{license}
				</pre>
			)}
		</div>
	);
}
