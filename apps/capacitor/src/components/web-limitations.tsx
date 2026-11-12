import { useNavigate } from "@tanstack/react-router";
import { Info, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SettingsSection } from "@/components/settings/settings-section";
import { IS_READ_ALOUD_SUPPORTED } from "@/services/tts";
import { openLink } from "@/utils/open-link";

export const WEB_LIMITATIONS = [
	"rsvpnano device",
	"Read aloud in the background and on the lock screen",
	"Reading reminders and notifications",
	"Turning pages with the volume keys",
	"Scanning a folder for books",
] as const;

export const ON_THE_WEB_HASH = "on-the-web";
const DISMISSED_KEY = "lesefluss:web-limits-dismissed";

function readDismissed(): boolean {
	try {
		return localStorage.getItem(DISMISSED_KEY) === "1";
	} catch {
		return false;
	}
}

export function WebLimitsLine() {
	const navigate = useNavigate();
	const [dismissed, setDismissed] = useState(readDismissed);

	if (dismissed) return null;

	const dismiss = () => {
		try {
			localStorage.setItem(DISMISSED_KEY, "1");
		} catch {
			// Best-effort: the line stays hidden for this visit either way.
		}
		setDismissed(true);
	};

	const seeWhatsDifferent = () => {
		dismiss();
		navigate({ to: "/tabs/settings", hash: ON_THE_WEB_HASH });
	};

	return (
		<div className="flex items-start gap-3 border-border border-b bg-muted/60 px-4 py-3 text-sm">
			<Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
			<span className="flex-1 text-muted-foreground">
				You are using the web app. A few things, like the rsvpnano device and reminders, need the
				Android app.{" "}
				<button
					type="button"
					onClick={seeWhatsDifferent}
					className="cursor-pointer font-medium text-primary underline-offset-4 hover:underline"
				>
					See what's different
				</button>
			</span>
			<button
				type="button"
				onClick={dismiss}
				aria-label="Dismiss"
				className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
			>
				<X className="size-4" />
			</button>
		</div>
	);
}

export function OnTheWebCard() {
	const ref = useRef<HTMLDivElement>(null);

	// The Settings root renders a spinner first, so the router's own hash scroll
	// can run before this card exists.
	useEffect(() => {
		if (window.location.hash !== `#${ON_THE_WEB_HASH}`) return;
		ref.current?.scrollIntoView();
		// Dropped so a later return to Settings keeps its restored scroll position.
		history.replaceState(history.state, "", window.location.pathname + window.location.search);
	}, []);

	return (
		<div id={ON_THE_WEB_HASH} ref={ref} className="scroll-mt-4">
			<SettingsSection title="On the web">
				<div className="px-4 py-3 text-sm">
					<p className="m-0 mb-2 text-muted-foreground">
						The web app has everything for reading, syncing and social. These need the Android app:
					</p>
					<ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-foreground">
						{WEB_LIMITATIONS.map((item) => (
							<li key={item}>{item}</li>
						))}
					</ul>
					<p className="m-0 mt-3 text-muted-foreground text-xs">
						{IS_READ_ALOUD_SUPPORTED && "Read aloud works while the app is open. "}
						<button
							type="button"
							onClick={() => openLink("https://lesefluss.app/download", { nativeTarget: "system" })}
							className="cursor-pointer font-medium text-primary underline-offset-4 hover:underline"
						>
							Get the Android app
						</button>
					</p>
				</div>
			</SettingsSection>
		</div>
	);
}
