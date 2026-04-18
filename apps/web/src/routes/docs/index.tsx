import { createFileRoute } from "@tanstack/react-router";
import { Bluetooth, BookMarked, Cpu, HardHat, HelpCircle, Rocket } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { useSiteFlags } from "~/lib/site-flags";
import { seo } from "~/utils/seo";
import { faqPageSchema } from "~/utils/structured-data";

const troubleshootingItems = [
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
		q: "The device doesn't wake from sleep",
		a: "Press the physical button. Deep sleep is triggered after a configurable idle timeout. If the button doesn't respond, the battery may be depleted - charge via USB.",
	},
	{
		q: "Firmware upload fails with mpremote",
		a: "Make sure the device is in dev mode (create a file named 'devmode' on the flash). Try disconnecting and reconnecting USB, then re-running the upload script.",
	},
];

export const Route = createFileRoute("/docs/")({
	component: DocsPage,
	head: () => ({
		...seo({
			title: "Docs - Lesefluss",
			description:
				"Getting started with Lesefluss: importing books, building the ESP32 reader, connecting your device, and troubleshooting.",
			path: "/docs",
		}),
		scripts: [faqPageSchema(troubleshootingItems)],
	}),
});

function TodoPlaceholder() {
	return (
		<div className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
			<HardHat className="h-10 w-10 opacity-40" />
			<p className="text-sm">This section is coming soon.</p>
		</div>
	);
}

type Section = {
	id: string;
	title: string;
	icon: LucideIcon;
	content: React.ReactNode;
};

function buildSections(hideGithub: boolean): Section[] {
	return [
		{
			id: "getting-started",
			title: "Getting Started",
			icon: Rocket,
			content: (
				<div className="space-y-4 text-muted-foreground leading-relaxed">
					<p>
						Lesefluss is a free Android app for speed reading your book library. No account is
						required - download the APK or install from the Play Store and start importing books.
					</p>
					<h4 className="font-semibold text-foreground">Install the app</h4>
					<ol className="list-inside list-decimal space-y-2 text-sm">
						<li>
							{hideGithub ? (
								<>Download the latest APK from Google Play or direct download (coming soon).</>
							) : (
								<>
									Download the latest APK from{" "}
									<a
										href="https://github.com/sch-28/lesefluss/releases"
										target="_blank"
										rel="noopener noreferrer"
										className="text-foreground underline decoration-border hover:decoration-foreground/50"
									>
										GitHub Releases
									</a>
									, or install from Google Play.
								</>
							)}
						</li>
						<li>Open the app - you'll land on the Library screen.</li>
						<li>
							Tap the <strong className="text-foreground">+</strong> button to import your first
							book.
						</li>
					</ol>
					<h4 className="font-semibold text-foreground">First read</h4>
					<p className="text-sm">
						Tap a book to open it, then tap <strong className="text-foreground">RSVP</strong> in the
						toolbar to enter speed reading mode. Adjust WPM from the settings slider. The default is
						350 WPM - a comfortable starting point.
					</p>
				</div>
			),
		},
		{
			id: "importing-books",
			title: "Importing Books",
			icon: BookMarked,
			content: (
				<div className="space-y-4 text-muted-foreground leading-relaxed">
					<p>
						The app supports EPUB and plain TXT files. EPUB is recommended - chapters, TOC, and
						metadata are extracted automatically.
					</p>
					<h4 className="font-semibold text-foreground">Where to get books</h4>
					<ul className="space-y-1.5 text-sm">
						{[
							["Project Gutenberg", "gutenberg.org - 70 000+ public domain books, EPUB + TXT"],
							["Standard Ebooks", "standardebooks.org - beautifully formatted public domain EPUB"],
							["Your own files", "Any .epub or .txt file from your device storage"],
						].map(([name, desc]) => (
							<li key={name} className="flex gap-2">
								<span className="shrink-0 text-muted-foreground/50">-</span>
								<span>
									<strong className="text-foreground">{name}</strong> · {desc}
								</span>
							</li>
						))}
					</ul>
					<h4 className="font-semibold text-foreground">Import steps</h4>
					<ol className="list-inside list-decimal space-y-2 text-sm">
						<li>
							Tap <strong className="text-foreground">+</strong> on the Library screen.
						</li>
						<li>
							Browse to your file using the system picker, or share directly from another app.
						</li>
						<li>The app strips formatting and stores plain text for fast RSVP.</li>
					</ol>
				</div>
			),
		},
		{
			id: "esp32-build-guide",
			title: "ESP32 Build Guide",
			icon: Cpu,
			content: <TodoPlaceholder />,
		},
		{
			id: "connecting-device",
			title: "Connecting Your Device",
			icon: Bluetooth,
			content: <TodoPlaceholder />,
		},
		{
			id: "troubleshooting",
			title: "Troubleshooting",
			icon: HelpCircle,
			content: (
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
					{!hideGithub && (
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
					)}
				</div>
			),
		},
	];
}

function DocsPage() {
	const { hideGithub } = useSiteFlags();
	const sections = useMemo(() => buildSections(hideGithub), [hideGithub]);
	const [active, setActive] = useState(sections[0].id);

	return (
		<div className="mx-auto w-full max-w-5xl px-6 py-12">
			<div className="mb-10">
				<h1 className="mb-2 font-bold text-3xl">Documentation</h1>
				<p className="text-muted-foreground">
					Guides for the app, the ESP32 device, and everything in between.
				</p>
			</div>

			<Tabs value={active} onValueChange={setActive} className="w-full">
				<div className="flex w-full gap-8 lg:gap-12">
					{/* Desktop sidebar - single TabsList */}
					<aside className="hidden w-52 shrink-0 lg:block">
						<TabsList className="sticky top-24 h-auto w-full flex-col gap-1 bg-transparent p-0">
							{sections.map((s) => (
								<TabsTrigger
									key={s.id}
									value={s.id}
									className="w-full justify-start rounded-lg px-3 py-2 text-left text-sm data-[state=active]:bg-muted data-[state=inactive]:bg-transparent data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground data-[state=inactive]:shadow-none data-[state=inactive]:hover:bg-muted/50 data-[state=inactive]:hover:text-foreground"
								>
									<s.icon className="mr-2 h-4 w-4 shrink-0" />
									{s.title}
								</TabsTrigger>
							))}
						</TabsList>
					</aside>

					<main className="min-w-0 flex-1">
						{/* Mobile nav - plain buttons, not a second TabsList */}
						<div className="mb-6 flex flex-wrap gap-2 lg:hidden" role="tablist">
							{sections.map((s) => (
								<button
									key={s.id}
									type="button"
									role="tab"
									aria-selected={active === s.id}
									onClick={() => setActive(s.id)}
									className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium text-sm transition-colors ${
										active === s.id
											? "bg-muted text-foreground"
											: "border border-border bg-transparent text-muted-foreground hover:text-foreground"
									}`}
								>
									<s.icon className="h-3.5 w-3.5" />
									{s.title}
								</button>
							))}
						</div>

						{sections.map((s) => (
							<TabsContent
								key={s.id}
								value={s.id}
								className="mt-0 min-h-64 w-full rounded-xl border border-border bg-muted/20 p-8"
							>
								<h2 className="mb-6 flex items-center gap-3 font-bold text-xl">
									<s.icon className="h-5 w-5" />
									{s.title}
								</h2>
								{s.content}
							</TabsContent>
						))}
					</main>
				</div>
			</Tabs>
		</div>
	);
}
