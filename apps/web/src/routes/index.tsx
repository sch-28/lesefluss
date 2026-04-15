import { createFileRoute, Link } from "@tanstack/react-router";
import type * as React from "react";
import { FeatureCard } from "~/components/feature-card";
import { StatCard } from "~/components/stat-card";
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
				<div className="absolute inset-0 bg-zinc-950/65" />
				<div className="relative mx-auto max-w-5xl px-6 py-44 text-center">
					<p className="mb-4 font-medium text-sm text-zinc-400 uppercase tracking-widest">
						Rapid Serial Visual Presentation
					</p>
					<h1 className="mb-6 font-bold text-5xl tracking-tight sm:text-6xl">
						Read faster.
						<br />
						<span className="text-zinc-300">One word at a time.</span>
					</h1>
					<p className="mx-auto mb-10 max-w-xl text-lg text-zinc-300">
						A free, open-source speed reading app for Android. Import any book, read at 350+ WPM,
						and optionally sync to a pocket-sized ESP32 device for screen-free reading.
					</p>
					<div className="flex flex-col justify-center gap-4 sm:flex-row">
						<Button asChild className="h-auto px-8 py-3 font-semibold text-base">
							<Link to="/download">Get the app</Link>
						</Button>
						<Button asChild variant="outline" className="h-auto px-8 py-3 font-semibold text-base">
							<Link to="/device">Build the device</Link>
						</Button>
					</div>
				</div>
			</section>

			{/* ── App Section ──────────────────────────────────────────── */}
			<section className="border-border border-t py-24">
				<div className="mx-auto max-w-5xl px-6">
					<div className="grid gap-12 lg:grid-cols-2 lg:items-center">
						<div>
							<p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-widest">
								Android App — Free
							</p>
							<h2 className="mb-5 font-bold text-3xl leading-tight">
								A complete reading experience,
								<br />
								no hardware required
							</h2>
							<p className="mb-8 text-muted-foreground leading-relaxed">
								The Lesefluss app works fully standalone. Manage your library, read EPUB and TXT
								books with the built-in reader, or switch to RSVP mode and blaze through chapters at
								300–600 WPM.
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
						{/* Stylised app mockup */}
						<div className="relative flex justify-center lg:justify-end">
							<div className="w-56 overflow-hidden rounded-3xl border border-zinc-700 bg-zinc-900 shadow-2xl shadow-zinc-950">
								<div className="flex items-center gap-2 border-zinc-700 border-b bg-zinc-800/60 px-4 py-3">
									<div className="h-2 w-2 rounded-full bg-zinc-600" />
									<span className="font-medium text-xs text-zinc-400">Lesefluss</span>
								</div>
								<div className="flex flex-col items-center p-5">
									<p className="mb-1 text-[10px] text-zinc-500 uppercase tracking-widest">
										350 WPM
									</p>
									<div className="my-6 text-center">
										<p className="font-bold text-2xl tracking-tight">
											ex
											<span className="text-zinc-300 underline decoration-zinc-500">tra</span>
											ordinary
										</p>
									</div>
									<div className="mb-4 h-1 w-full rounded-full bg-zinc-800">
										<div className="h-1 w-2/5 rounded-full bg-zinc-500" />
									</div>
									<p className="text-[10px] text-zinc-500">Chapter 3 · 42%</p>
								</div>
								<div
									aria-hidden="true"
									className="grid grid-cols-3 divide-x divide-zinc-800 border-zinc-800 border-t text-center"
								>
									{["Library", "Reader", "Settings"].map((tab) => (
										<button
											key={tab}
											type="button"
											tabIndex={-1}
											className={`py-2.5 font-medium text-[10px] ${tab === "Reader" ? "text-zinc-100" : "text-zinc-500"}`}
										>
											{tab}
										</button>
									))}
								</div>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* ── Features ─────────────────────────────────────────────── */}
			<section className="border-border border-t bg-muted/20 py-20">
				<div className="mx-auto max-w-5xl px-6">
					<h2 className="mb-3 text-center font-bold text-3xl">Everything you need</h2>
					<p className="mb-12 text-center text-muted-foreground">
						Built for readers who want to go faster without losing comprehension.
					</p>
					<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
						<div className="order-2 lg:order-1">
							<div className="grid grid-cols-2 gap-3">
								{specs.map((spec) => (
									<StatCard key={spec.label} {...spec} />
								))}
							</div>
						</div>
						<div className="order-1 lg:order-2">
							<p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-widest">
								Optional Hardware — ~€25
							</p>
							<h2 className="mb-5 font-bold text-3xl leading-tight">
								Take reading
								<br />
								off the screen
							</h2>
							<p className="mb-6 text-muted-foreground leading-relaxed">
								Pair the app with a pocket-sized ESP32 device for a distraction-free reading
								experience. AMOLED or TFT display, single-button operation, weeks of battery life.
								Build it yourself for ~€25 in parts.
							</p>
							<p className="mb-8 text-muted-foreground text-sm">
								The build guide is free. Source code is open. A donation is welcome but never
								required.
							</p>
							<Button
								asChild
								variant="outline"
								className="h-auto px-6 py-2.5 font-semibold text-sm"
							>
								<Link to="/device">Free build guide →</Link>
							</Button>
						</div>
					</div>
				</div>
			</section>

			{/* ── Open Source CTA ──────────────────────────────────────── */}
			<section className="border-border border-t bg-muted/20 py-20">
				<div className="mx-auto max-w-3xl px-6 text-center">
					<div className="mb-4 text-3xl">🔓</div>
					<h2 className="mb-4 font-bold text-2xl">Fully open source</h2>
					<p className="mb-8 text-muted-foreground leading-relaxed">
						MicroPython firmware, Ionic/Capacitor app, and this site — all on GitHub. Fork it,
						modify it, submit a PR. No telemetry, no accounts required.
					</p>
					<div className="flex flex-wrap justify-center gap-4">
						<Button asChild variant="outline" className="h-auto px-6 py-2.5 font-semibold text-sm">
							<a href="https://github.com/sch-28/lesefluss" target="_blank" rel="noopener noreferrer">
								View on GitHub →
							</a>
						</Button>
						<Button asChild variant="outline" className="h-auto px-6 py-2.5 font-semibold text-sm">
							<Link to="/docs">Read the docs →</Link>
						</Button>
					</div>
				</div>
			</section>
		</div>
	);
}

const appFeatures = [
	"Book library with EPUB and TXT support",
	"Built-in chapter reader with themes and typography controls",
	"In-app RSVP reader at up to 1000 WPM",
	"Dictionary lookup and word highlights",
	"Chapter and TOC navigation for EPUB",
	"Bluetooth sync to ESP32 device (optional)",
];

const features = [
	{
		icon: "📚",
		title: "Library & import",
		description:
			"Import EPUB or TXT from anywhere — Project Gutenberg, Standard Ebooks, your own files. Chapters auto-detected.",
	},
	{
		icon: "⚡",
		title: "RSVP reading",
		description:
			"Words flash at your chosen WPM — 100 to 1000. Optimal Recognition Point keeps your eye locked to one spot.",
	},
	{
		icon: "📖",
		title: "Built-in reader",
		description:
			"Full e-reader with dark, sepia, and light themes. Adjustable font, size, line spacing, and margins.",
	},
	{
		icon: "🔍",
		title: "Dictionary & highlights",
		description:
			"Tap any word while reading to look it up. Highlight passages and search through them later.",
	},
	{
		icon: "🎛️",
		title: "Tunable speed",
		description:
			"Adjust WPM, punctuation pause multipliers, acceleration ramp, and focal position to match your reading style.",
	},
	{
		icon: "📡",
		title: "ESP32 sync",
		description:
			"Optionally pair with the hardware device. Sync your book and reading position over Bluetooth in seconds.",
	},
];

const specs = [
	{ label: "CPU", value: "ESP32-S3" },
	{ label: "Display", value: "AMOLED / TFT" },
	{ label: "Connectivity", value: "BLE 5.0" },
	{ label: "Runtime", value: "MicroPython" },
];
