import { createFileRoute } from "@tanstack/react-router";
import { Bluetooth, BookMarked, BookOpen, Globe, Highlighter, Library, Zap } from "lucide-react";
import { FeatureCard } from "~/components/feature-card";
import { GooglePlayIcon } from "~/components/icons/google-play";
import { StatCard } from "~/components/stat-card";
import { seo } from "~/utils/seo";

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=app.lesefluss";

export const Route = createFileRoute("/download/")({
	component: DownloadPage,
	head: () =>
		seo({
			title: "Download - Lesefluss",
			description:
				"Get the Lesefluss speed reading app for Android or open the web app. Import EPUB and TXT, read at up to 1000 WPM, fully offline.",
			path: "/download",
		}),
});

const features = [
	{
		icon: Library,
		title: "Book library",
		description: "Import EPUB and TXT. Metadata and chapters detected automatically.",
	},
	{
		icon: Zap,
		title: "RSVP reader",
		description: "Words flash at 100–1000 WPM with optimal letter alignment.",
	},
	{
		icon: BookOpen,
		title: "Built-in e-reader",
		description: "Dark and light themes. Adjustable font size, spacing, and margins.",
	},
	{
		icon: BookMarked,
		title: "Chapter navigation",
		description: "EPUB table of contents with one-tap chapter jumps.",
	},
	{
		icon: Highlighter,
		title: "Highlights and dictionary",
		description:
			"Long-press to highlight passages with color and notes. Tap a highlighted word for its dictionary definition. Search through the full book text.",
	},
	{
		icon: Globe,
		title: "Built-in library",
		description: "Browse and import from Project Gutenberg and Standard Ebooks. No account needed.",
	},
	{
		icon: Bluetooth,
		title: "Device sync",
		description: "Sync your book and reading position to the ESP32 device over Bluetooth.",
	},
];

const requirements = [
	{ label: "Platform", value: "Android 8.0+" },
	{ label: "Storage", value: "~30 MB + books" },
	{ label: "Permissions", value: "Bluetooth (optional)" },
];

function DownloadPage() {
	return (
		<div>
			{/* ── Hero ─────────────────────────────────────────────────── */}
			<section className="py-20">
				<div className="mx-auto max-w-5xl px-6">
					<p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-widest">
						Android App
					</p>
					<h1 className="mb-5 font-bold text-4xl leading-tight sm:text-5xl">
						Lesefluss
						<br />
						<span className="text-muted-foreground">for Android</span>
					</h1>
					<p className="mb-10 max-w-xl text-lg text-muted-foreground leading-relaxed">
						Import your own EPUB and TXT books, or pick from thousands of free classics on the
						built-in Explore page. Read at your own pace or push up to 1000 WPM with RSVP. No
						account required, fully offline.
					</p>
					<div className="flex flex-col items-start gap-3">
						<a
							href={PLAY_STORE_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="relative inline-flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-3 transition-colors hover:border-foreground/30"
						>
							<GooglePlayIcon className="h-6 w-6 fill-foreground" />
							<div className="text-left">
								<p className="text-[10px] text-muted-foreground">Get it on</p>
								<p className="font-semibold text-sm">Google Play</p>
							</div>
						</a>
						<a
							href="https://github.com/sch-28/lesefluss/releases/latest"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1.5 text-muted-foreground text-xs underline-offset-4 hover:text-foreground hover:underline"
						>
							<svg
								viewBox="0 0 24 24"
								className="h-3.5 w-3.5 fill-none stroke-2 stroke-current"
								aria-hidden="true"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
								/>
							</svg>
							Advanced: sideload APK from GitHub
						</a>
					</div>
				</div>
			</section>

			{/* ── Feature Grid ─────────────────────────────────────────── */}
			<section className="bg-muted/30 py-20">
				<div className="mx-auto max-w-5xl px-6">
					<h2 className="mb-12 font-bold text-2xl">Features</h2>
					<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{features.map((f) => (
							<FeatureCard key={f.title} {...f} />
						))}
					</div>
				</div>
			</section>

			{/* ── Requirements ─────────────────────────────────────────── */}
			<section className="py-20">
				<div className="mx-auto max-w-5xl px-6">
					<h2 className="mb-8 font-bold text-2xl">Requirements</h2>
					<div className="grid gap-4 sm:grid-cols-3">
						{requirements.map((r) => (
							<StatCard key={r.label} {...r} />
						))}
					</div>
					<p className="mt-6 text-muted-foreground text-sm">
						The app works entirely offline. An ESP32 device and cloud account are optional.
					</p>
				</div>
			</section>
		</div>
	);
}
