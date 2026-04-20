import { Link } from "@tanstack/react-router";
import { Rocket } from "lucide-react";
import type { DocsSection } from "./shared";

const linkClass = "text-foreground underline decoration-border hover:decoration-foreground/50";

function Content() {
	return (
		<div className="space-y-4 text-muted-foreground leading-relaxed">
			<p>
				Lesefluss lives in three places that all stay in sync: a web app at{" "}
				<a href="https://lesefluss.app/app" className={linkClass}>
					lesefluss.app/app
				</a>
				, an Android app, and an optional handheld ESP32 device you can build yourself.
			</p>

			<h4 className="font-semibold text-foreground">Install the Android app</h4>
			<p className="text-sm">
				Grab the APK from{" "}
				<a
					href="https://github.com/sch-28/lesefluss/releases"
					target="_blank"
					rel="noopener noreferrer"
					className={linkClass}
				>
					GitHub Releases
				</a>
				, or install from Google Play once it's up. No account required to start reading, but you
				can sign in if you want sync across devices.
			</p>

			<h4 className="font-semibold text-foreground">Where to go from here</h4>
			<ul className="space-y-2 text-sm">
				<li className="flex gap-2">
					<span className="shrink-0 text-muted-foreground/50">-</span>
					<span>
						<Link to="/docs" search={{ tab: "importing-books" }} className={linkClass}>
							Importing books
						</Link>{" "}
						- add EPUBs from your device or pick one from the built-in Explore page.
					</span>
				</li>
				<li className="flex gap-2">
					<span className="shrink-0 text-muted-foreground/50">-</span>
					<span>
						<Link to="/docs" search={{ tab: "esp32-build-guide" }} className={linkClass}>
							ESP32 build guide
						</Link>{" "}
						- parts list, case files and firmware flashing for the handheld reader.
					</span>
				</li>
				<li className="flex gap-2">
					<span className="shrink-0 text-muted-foreground/50">-</span>
					<span>
						<Link to="/docs" search={{ tab: "connecting-device" }} className={linkClass}>
							Connecting your device
						</Link>{" "}
						- pair the ESP32 over Bluetooth and send books to it.
					</span>
				</li>
				<li className="flex gap-2">
					<span className="shrink-0 text-muted-foreground/50">-</span>
					<span>
						<Link to="/docs" search={{ tab: "troubleshooting" }} className={linkClass}>
							Troubleshooting
						</Link>{" "}
						- common issues with Bluetooth, transfers, EPUBs and firmware uploads.
					</span>
				</li>
			</ul>
		</div>
	);
}

export const gettingStartedSection: DocsSection = {
	id: "getting-started",
	title: "Getting Started",
	icon: Rocket,
	Content,
};
