import { Bluetooth } from "lucide-react";
import type { DocsSection } from "./shared";

function Content() {
	return (
		<div className="space-y-4 text-muted-foreground leading-relaxed">
			<p>
				Once the ESP32 is flashed and powered on, the app picks it up automatically over Bluetooth.
				There's no manual pairing, no codes, and nothing to configure on the device itself.
			</p>

			<h4 className="font-semibold text-foreground">First connection</h4>
			<p className="text-sm">
				Open the Lesefluss app with Bluetooth enabled on your phone. The reader advertises as{" "}
				<code className="rounded bg-muted px-1 text-foreground">Lesefluss</code> and the app
				connects on its own. You'll see the Bluetooth indicator go active in the tab bar.
			</p>

			<h4 className="font-semibold text-foreground">Send a book</h4>
			<ol className="list-inside list-decimal space-y-2 text-sm">
				<li>
					In your library, long-press a book and pick{" "}
					<strong className="text-foreground">Set active on device</strong>.
				</li>
				<li>
					Stay within a metre or two while the file transfers. Bigger books take a few minutes.
				</li>
				<li>When it's done, press the button on the ESP32 to start reading.</li>
			</ol>

			<h4 className="font-semibold text-foreground">Everything syncs</h4>
			<p className="text-sm">
				Reading position, settings and the active book all sync in both directions while connected.
				Read a few pages on the device, open the app later, and you pick up where you left off.
			</p>

			<h4 className="font-semibold text-foreground">If something isn't working</h4>
			<p className="text-sm">
				Head into the device settings in the app. You can force a rescan, and reconnect manually
				from there.
			</p>
		</div>
	);
}

export const connectingDeviceSection: DocsSection = {
	id: "connecting-device",
	title: "Connecting Your Device",
	icon: Bluetooth,
	Content,
};
