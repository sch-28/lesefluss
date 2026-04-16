import { createFileRoute, Link } from "@tanstack/react-router";
import { Bluetooth, BookOpen, Cpu, Download, Highlighter, Library, SlidersHorizontal, Zap } from "lucide-react";
import type * as React from "react";
import { FeatureCard } from "~/components/feature-card";
import { HeroRsvp } from "~/components/hero-rsvp";
import { RsvpPreview } from "~/components/rsvp-preview";
import { Button } from "~/components/ui/button";

export const Route = createFileRoute("/")({
	component: Home,
});

const handleVideoEnded = (e: React.SyntheticEvent<HTMLVideoElement>) => {
	e.currentTarget.pause();
};

function Home() {
	return (
		<div>
			{/* ── Hero ─────────────────────────────────────────────────── */}
			<section className="relative w-full overflow-hidden">
				<video
					src="/landing.mp4"
					autoPlay
					muted
					playsInline
					className="absolute inset-0 h-full w-full object-cover"
					onEnded={handleVideoEnded}
					ref={(el) => {
						if (el) el.playbackRate = 0.85;
					}}
				/>
				<div className="relative mx-auto max-w-5xl px-6 py-44 text-center mix-blend-difference">
					<h1 className="mb-6 font-bold text-5xl tracking-tight text-white sm:text-6xl">
						Read <HeroRsvp />
						<br />
						<span className="text-white">One word at a time.</span>
					</h1>
					<p className="mx-auto mb-10 max-w-xl text-lg text-white/90">
						Speed reading app for Android. Import any book, read at up to 1000 WPM.
						Pair it with an ESP32 device for screen-free reading.
					</p>
					<div className="flex flex-col justify-center gap-4 sm:flex-row">
						<Link to="/download" className="inline-flex items-center gap-2 rounded-md border-2 border-white bg-white px-8 py-3 font-semibold text-base text-black transition-colors hover:bg-white/80">
							<Download className="h-4 w-4" />
							Get the app
						</Link>
						<Link to="/device" className="inline-flex items-center gap-2 rounded-md border-2 border-white bg-transparent px-8 py-3 font-semibold text-base text-white transition-colors hover:bg-white/10">
							<Cpu className="h-4 w-4" />
							Build the device
						</Link>
					</div>
				</div>
			</section>

			{/* ── App Section ──────────────────────────────────────────── */}
			<section className="border-border border-t py-24">
				<div className="mx-auto max-w-5xl px-6">
					<div className="grid gap-12 lg:grid-cols-2 lg:items-center">
						<div>
							<p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-widest">
								The App
							</p>
							<h2 className="mb-5 font-bold text-3xl leading-tight">
								Read on your phone
							</h2>
							<p className="mb-8 text-muted-foreground leading-relaxed">
								Import EPUB and TXT books, read with the built-in reader, or switch to RSVP mode
								for speed reading.
							</p>
							<ul className="mb-8 space-y-3">
								{appFeatures.map((f) => (
									<li key={f} className="flex items-center gap-3 text-sm">
										<span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
										{f}
									</li>
								))}
							</ul>
							<div className="flex flex-wrap gap-3">
								<Button asChild className="h-auto px-6 py-2.5 font-semibold text-sm">
									<Link to="/download">Download the app</Link>
								</Button>
								<Button
									asChild
									variant="outline"
									className="h-auto px-6 py-2.5 font-semibold text-sm"
								>
									<Link to="/docs">Getting started →</Link>
								</Button>
							</div>
						</div>
						<div className="relative flex justify-center lg:justify-end">
							<RsvpPreview />
						</div>
					</div>
				</div>
			</section>

			{/* ── Features ─────────────────────────────────────────────── */}
			<section className="bg-muted/50 py-24">
				<div className="mx-auto max-w-5xl px-6">
					<h2 className="mb-12 text-center font-bold text-3xl">Features</h2>
					<div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
						{features.map((feature) => (
							<FeatureCard key={feature.title} {...feature} />
						))}
					</div>
				</div>
			</section>

			{/* ── Device Section ───────────────────────────────────────── */}
			<section className="border-border border-t py-24">
				<div className="mx-auto max-w-5xl px-6">
					<div className="grid gap-12 lg:grid-cols-2 lg:items-center">
						<div className="relative flex justify-center lg:justify-start">
							<video
								src="/single.mp4"
								autoPlay
								muted
								loop
								playsInline
								className="w-200"
							/>
						</div>
						<div>
							<p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-widest">
								Hardware
							</p>
							<h2 className="mb-5 font-bold text-3xl leading-tight">
								Take reading
								<br />
								off the screen
							</h2>
							<p className="mb-8 text-muted-foreground leading-relaxed">
								Pocket-sized ESP32 reader. AMOLED or TFT, single button, weeks of battery.
								~€25 in parts.
							</p>
							<ul className="mb-8 space-y-3">
								{deviceFeatures.map((f) => (
									<li key={f} className="flex items-center gap-3 text-sm">
										<span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
										{f}
									</li>
								))}
							</ul>
							<Button
								asChild
								variant="outline"
								className="h-auto px-6 py-2.5 font-semibold text-sm"
							>
								<Link to="/device">Build guide →</Link>
							</Button>
						</div>
					</div>
				</div>
			</section>
		</div>
	);
}

const appFeatures = [
	"EPUB and TXT library",
	"Built-in reader with themes",
	"RSVP speed reading up to 1000 WPM",
	"Bluetooth sync to ESP32 (optional)",
];

const features = [
	{
		icon: Library,
		title: "Library & import",
		description: "Import EPUB or TXT. Chapters and metadata detected automatically.",
	},
	{
		icon: Zap,
		title: "RSVP reading",
		description: "Words flash at 100–1000 WPM with optimal letter alignment.",
	},
	{
		icon: BookOpen,
		title: "Built-in reader",
		description: "Dark, sepia, and light themes. Adjustable font, spacing, and margins.",
	},
	{
		icon: Highlighter,
		title: "Dictionary & highlights",
		description: "Tap any word to look it up. Highlight and search passages.",
	},
	{
		icon: SlidersHorizontal,
		title: "Tunable speed",
		description: "Fine-tune WPM, punctuation pauses, acceleration, and focal position.",
	},
	{
		icon: Bluetooth,
		title: "ESP32 sync",
		description: "Sync your book and reading position over Bluetooth.",
	},
];

const deviceFeatures = [
	"AMOLED or TFT display",
	"Single button operation",
	"Weeks of battery life",
	"BLE sync to companion app",
];
