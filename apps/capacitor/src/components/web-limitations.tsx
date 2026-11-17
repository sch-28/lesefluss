import { Button } from "@lesefluss/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { Info, Smartphone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NoticeBar } from "@/components/notice-bar";
import { SettingsSection } from "@/components/settings/settings-section";
import { batchPickerKind } from "@/services/book-import/sources/folder-scan";
import { PLAY_STORE_URL } from "@/services/store-links";
import { IS_READ_ALOUD_SUPPORTED } from "@/services/tts";
import { openLink } from "@/utils/open-link";

const FOLDER_SCAN = "Scanning a folder for books";

/** A desktop browser can pick a folder for the batch import; phone and tablet browsers cannot. */
export function webLimitations(): string[] {
	return [
		"rsvpnano device",
		"Listening in the background and on the lock screen",
		"Reading reminders and notifications",
		"Turning pages with the volume keys",
		...(batchPickerKind() === "files" ? [FOLDER_SCAN] : []),
	];
}

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
		<NoticeBar
			icon={<Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
			onDismiss={dismiss}
		>
			Some features need the Android app.{" "}
			<button
				type="button"
				onClick={seeWhatsDifferent}
				className="cursor-pointer font-medium text-primary underline-offset-4 hover:underline"
			>
				See what's different
			</button>
		</NoticeBar>
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
		<div id={ON_THE_WEB_HASH} ref={ref} className="scroll-mt-4 pt-6">
			<SettingsSection title="On the web">
				<div className="px-4 py-3 text-sm">
					<p className="m-0 mb-2 text-muted-foreground">
						The web app has everything for reading, syncing and social. These need the Android app:
					</p>
					<ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-foreground">
						{webLimitations().map((item) => (
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
						wrapLabel
						className="mt-3 max-w-full"
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
