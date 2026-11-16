import { Button } from "@lesefluss/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { Info, Smartphone, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SettingsSection } from "@/components/settings/settings-section";
import { PLAY_STORE_URL } from "@/services/store-links";
import { IS_READ_ALOUD_SUPPORTED } from "@/services/tts";
import { openLink } from "@/utils/open-link";

export const WEB_LIMITATIONS = [
	"rsvpnano device",
	"Listening in the background and on the lock screen",
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
				className="-my-2 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
			>
				<X className="size-4" />
			</button>
		</div>
	);
}

const SETTLE_MS = 1500;
const USER_SCROLL_EVENTS = ["wheel", "touchstart", "keydown", "pointerdown"] as const;

/**
 * Scrolls `el` into view and keeps it there while the page settles: the router's
 * scroll handling runs after this card mounts, and the sections above it grow as
 * their queries resolve. Stops at once when the reader scrolls themselves.
 */
export function keepInView(el: HTMLElement, ms: number): () => void {
	let frame = 0;
	const scroll = () => {
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(() => el.scrollIntoView({ block: "start" }));
	};
	const container = el.closest<HTMLElement>("[data-scroll-restoration-id]") ?? document.body;
	const observer = new ResizeObserver(scroll);
	for (const child of Array.from(container.children)) observer.observe(child);
	observer.observe(container);
	const stop = () => {
		clearTimeout(timer);
		cancelAnimationFrame(frame);
		observer.disconnect();
		for (const type of USER_SCROLL_EVENTS) window.removeEventListener(type, stop, true);
	};
	for (const type of USER_SCROLL_EVENTS) window.addEventListener(type, stop, true);
	const timer = setTimeout(stop, ms);
	scroll();
	return stop;
}

export function OnTheWebCard() {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (window.location.hash !== `#${ON_THE_WEB_HASH}`) return;
		// Dropped so a later return to Settings keeps its restored scroll position.
		history.replaceState(history.state, "", window.location.pathname + window.location.search);
		const card = ref.current;
		return card ? keepInView(card, SETTLE_MS) : undefined;
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
					{IS_READ_ALOUD_SUPPORTED && (
						<p className="m-0 mt-3 text-muted-foreground text-xs">
							Listen works while the app is open.
						</p>
					)}
					<Button
						variant="outline"
						className="mt-3"
						onClick={() => openLink(PLAY_STORE_URL, { nativeTarget: "system" })}
					>
						<Smartphone />
						Get the Android app
					</Button>
				</div>
			</SettingsSection>
		</div>
	);
}
