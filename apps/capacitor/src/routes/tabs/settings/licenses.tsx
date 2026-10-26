import { createFileRoute } from "@tanstack/react-router";
import { Scale } from "lucide-react";
import atkinsonLicense from "@/assets/licenses/fonts/atkinson-hyperlegible-OFL.txt?raw";
import literataLicense from "@/assets/licenses/fonts/literata-OFL.txt?raw";
import openDyslexicLicense from "@/assets/licenses/fonts/opendyslexic-OFL.txt?raw";
import { PageHeader } from "@/components/app-shell/page-header";
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
			<PageHeader title="Open source licenses" icon={Scale} />
			<div className="mx-auto max-w-2xl px-4 pt-4 pb-10">
				<SettingsSection title="Reader fonts">
					{NOTICES.map(({ title, license }) => (
						<details key={title} className="border-border border-b px-4 py-3 last:border-b-0">
							<summary className="cursor-pointer font-medium text-foreground text-sm">
								{title}
							</summary>
							<pre className="mt-3 whitespace-pre-wrap break-words font-mono text-muted-foreground text-xs">
								{license}
							</pre>
						</details>
					))}
				</SettingsSection>
			</div>
		</div>
	);
}
