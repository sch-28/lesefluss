import { HelpCircle } from "lucide-react";
import type { DocsSection } from "./shared";

export const troubleshootingItems = [
	{
		q: "The app can't find my ESP32 device",
		a: "Make sure Bluetooth is enabled on your phone and the device is powered on. BLE advertising stops during Wi-Fi mode - if the device's web UI is open, close it. Scan range is roughly 10 metres.",
	},
	{
		q: "Book upload fails or gets stuck",
		a: "Stay close to the device during transfer (within 1–2 m). The AMOLED firmware has smaller BLE buffers than ST7789 - if you're on AMOLED and seeing frequent failures, try reducing the transfer window in settings. This will be fixed in a future firmware update.",
	},
	{
		q: "EPUB import shows no chapters",
		a: "Some EPUB files use non-standard chapter structures. Try opening the file in Calibre and re-exporting as EPUB 3 with a proper table of contents.",
	},
	{
		q: "Firmware upload fails with mpremote",
		a: "Make sure the device is in dev mode (You can set it in the Android app). Try disconnecting and reconnecting USB, then re-running the upload script.",
	},
];

function Content() {
	return (
		<div className="space-y-4 text-muted-foreground leading-relaxed">
			<div className="space-y-3">
				{troubleshootingItems.map((item) => (
					<details key={item.q} className="rounded-lg border border-border bg-muted/30">
						<summary className="cursor-pointer select-none px-4 py-3 font-medium text-foreground text-sm">
							{item.q}
						</summary>
						<p className="border-border border-t px-4 py-3 text-sm leading-relaxed">{item.a}</p>
					</details>
				))}
			</div>
			<p className="pt-2 text-sm">
				Still stuck?{" "}
				<a
					href="https://github.com/sch-28/lesefluss/issues"
					target="_blank"
					rel="noopener noreferrer"
					className="text-foreground underline decoration-border hover:decoration-foreground/50"
				>
					Open an issue on GitHub
				</a>
				.
			</p>
		</div>
	);
}

export const troubleshootingSection: DocsSection = {
	id: "troubleshooting",
	title: "Troubleshooting",
	icon: HelpCircle,
	Content,
};
