import { createFileRoute, Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
	Battery,
	Bluetooth,
	BookOpen,
	Download,
	Highlighter,
	Library,
	Monitor,
	Power,
	SlidersHorizontal,
	Zap,
} from "lucide-react";
import type * as React from "react";
import { useCallback, useEffect, useMemo } from "react";
import { ExploreWall } from "~/components/explore-wall";
import { FeatureCard } from "~/components/feature-card";
import { HeroRsvp } from "~/components/hero-rsvp";
import { RsvpPreview } from "~/components/rsvp-preview";
import { Button } from "~/components/ui/button";
import { getCatalogCounts } from "~/lib/explore-covers";
import { staticCovers } from "~/lib/static-covers";
import { seo } from "~/utils/seo";
import { softwareApplicationSchema } from "~/utils/structured-data";

export const Route = createFileRoute("/")({
	component: Home,
	loader: async () => {
		const counts = await getCatalogCounts();
		return { covers: staticCovers, counts };
	},
	head: () => ({
		...seo({
			title: "Lesefluss - Speed Reading App & Device",
			description:
				"Read books 2–4× faster with RSVP. Web app, Android app, and an optional DIY ESP32 reader. Import EPUB or TXT, and sync your library, position and settings across all three.",
			path: "/",
		}),
		scripts: [softwareApplicationSchema],
	}),
});

const handleVideoEnded = (e: React.SyntheticEvent<HTMLVideoElement>) => {
	e.currentTarget.pause();
};

const glowStyle = { filter: "blur(60px)", transform: "scale(1.4)" };

function Home() {
	const { covers, counts } = Route.useLoaderData();
	const stats = useMemo(() => buildStats(counts), [counts]);

	useEffect(() => {
		import("aos")
			.then((AOS) =>
				AOS.default.init({ duration: 650, easing: "ease-out-cubic", once: true, offset: 60 }),
			)
			.catch(() => {});
	}, []);

	const videoRef = useCallback((el: HTMLVideoElement | null) => {
		if (!el) return;
		el.playbackRate = 0.85;
		if (typeof IntersectionObserver === "undefined") {
			el.play().catch(() => {});
			return;
		}
		const obs = new IntersectionObserver(
			(entries) => {
				for (const e of entries) {
					if (e.isIntersecting) {
						el.play().catch(() => {});
					} else {
						el.pause();
					}
				}
			},
			{ threshold: 0.25 },
		);
		obs.observe(el);
	}, []);

	return (
		<div>
			{/* ── Hero: Explore Wall ───────────────────────────────────── */}
			<ExploreWall covers={covers} />

			{/* ── Stats Strip ──────────────────────────────────────────── */}
			<section className="relative bg-foreground pt-10 pb-28 text-background">
				<div className="mx-auto max-w-5xl px-6">
					<div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
						{stats.map(({ value, label }) => (
							<div key={label} className="text-center">
								<p className="font-bold text-2xl sm:text-3xl">{value}</p>
								<p className="mt-1 text-background/55 text-sm">{label}</p>
							</div>
						))}
					</div>
				</div>
				{/* Wave flowing into the page */}
				<div className="absolute right-0 bottom-0 left-0 text-background leading-none">
					<svg
						viewBox="0 0 1440 72"
						preserveAspectRatio="none"
						className="block h-18 w-full"
						aria-hidden="true"
					>
						<path
							d="M0,36 C240,0 480,72 720,36 C960,0 1200,72 1440,36 L1440,72 L0,72 Z"
							fill="currentColor"
						/>
					</svg>
				</div>
			</section>

			{/* ── App Section ──────────────────────────────────────────── */}
			<section className="py-24">
				<div className="mx-auto max-w-5xl px-6">
					<div className="grid gap-12 lg:grid-cols-[3fr_2fr] lg:items-center">
						<div data-aos="fade-right" className="text-center lg:text-left">
							<p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-widest">
								The App
							</p>
							<h2 className="mb-5 font-bold text-3xl leading-tight">
								Read on your phone or in the browser
							</h2>
							<p className="mb-8 text-muted-foreground leading-relaxed">
								Import DRM-free EPUB or TXT books, or pick one from the built-in Explore page
								(Project Gutenberg and Standard Ebooks). Read with the built-in reader, or switch to
								RSVP mode for speed reading.
							</p>
							<div className="mb-8 flex flex-wrap justify-center gap-2 lg:justify-start">
								{appFeatures.map(({ icon: Icon, label }) => (
									<span
										key={label}
										className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-foreground/80 text-sm"
									>
										<Icon className="h-3.5 w-3.5 text-muted-foreground" />
										{label}
									</span>
								))}
							</div>
							<div className="flex flex-wrap justify-center gap-3 lg:justify-start">
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
						<div className="relative flex justify-center lg:justify-end" data-aos="fade-left">
							<div className="absolute inset-0 rounded-full bg-primary/10" style={glowStyle} />
							<div className="relative rotate-2">
								<RsvpPreview />
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* ── Features ─────────────────────────────────────────────── */}
			<section className="bg-muted/50 py-24">
				<div className="mx-auto max-w-5xl px-6">
					<h2 className="mb-12 text-center font-bold text-3xl" data-aos="fade-up">
						Features
					</h2>
					<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
						{features.map((feature, i) => (
							<div key={feature.title} data-aos="fade-up" data-aos-delay={(i % 3) * 80}>
								<FeatureCard {...feature} />
							</div>
						))}
					</div>
				</div>
			</section>

			{/* ── RSVP in action ───────────────────────────────────────── */}
			<section className="relative isolate overflow-hidden border-border border-t py-24">
				<video
					src="/landing.mp4"
					poster="/landing-poster.jpg"
					preload="none"
					muted
					playsInline
					className="absolute inset-0 -z-10 h-full w-full object-cover opacity-50"
					onEnded={handleVideoEnded}
					ref={videoRef}
				/>
				<div
					aria-hidden
					className="absolute inset-0 -z-10 bg-gradient-to-b from-background/75 via-background/55 to-background/85"
				/>
				<div className="mx-auto max-w-3xl px-6 text-center" data-aos="fade-up">
					<p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-[0.25em]">
						Rapid Serial Visual Presentation
					</p>
					<h2 className="mb-5 font-bold text-4xl tracking-tight sm:text-5xl">
						Read <HeroRsvp />
						<br />
						One word at a time.
					</h2>
					<p className="mx-auto max-w-xl text-foreground/80 leading-relaxed">
						Flash words one at a time with optimal letter alignment. Your eyes stop jumping, your
						pace stays steady, and you read 2–4× faster without losing comprehension.
					</p>
				</div>
			</section>

			{/* ── Device Section ───────────────────────────────────────── */}
			<section className="border-border py-24">
				<div className="mx-auto max-w-5xl px-6">
					<div className="grid gap-12 lg:grid-cols-2 lg:items-center">
						<div className="relative flex justify-center lg:justify-start" data-aos="fade-right">
							<video
								src="/single.mp4"
								poster="/single-poster.jpg"
								preload="none"
								autoPlay
								muted
								loop
								playsInline
								className="w-full max-w-md"
							/>
						</div>
						<div data-aos="fade-left" className="text-center lg:text-left">
							<p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-widest">
								Hardware
							</p>
							<h2 className="mb-5 font-bold text-3xl leading-tight">
								Leave the phone
								<br />
								behind
							</h2>
							<p className="mb-8 text-muted-foreground leading-relaxed">
								Pocket-sized ESP32 reader. AMOLED or TFT, single button, weeks of battery. ~€25 in
								parts.
							</p>
							<div className="mb-8 flex flex-wrap justify-center gap-2 lg:justify-start">
								{deviceFeatures.map(({ icon: Icon, label }) => (
									<span
										key={label}
										className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-foreground/80 text-sm"
									>
										<Icon className="h-3.5 w-3.5 text-muted-foreground" />
										{label}
									</span>
								))}
							</div>
							<div className="flex justify-center lg:justify-start">
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
				</div>
			</section>

			{/* ── Open Source CTA ──────────────────────────────────────── */}
			<section className="bg-foreground py-28 text-background">
				<div className="mx-auto max-w-3xl px-6 text-center" data-aos="fade-up">
					<p className="mb-3 font-semibold text-background/50 text-xs uppercase tracking-widest">
						Open source
					</p>
					<h2 className="mb-5 font-bold text-4xl text-background leading-tight">
						No subscription needed.
					</h2>
					<p className="mx-auto mb-10 max-w-lg text-background/65 leading-relaxed">
						The app is free. Read, import books, and sync your device — no account required.
						Optional cloud sync available.
					</p>
					<div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
						<Button asChild className="h-auto px-8 py-3 font-semibold text-sm">
							<Link to="/download">
								<Download className="mr-2 h-4 w-4" />
								Get the app
							</Link>
						</Button>
						<a
							href="https://github.com/sch-28/lesefluss"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-2 rounded-md border-2 border-background/30 bg-transparent px-8 py-3 font-semibold text-background text-sm transition-colors hover:bg-background/10"
						>
							View on GitHub
						</a>
					</div>
				</div>
			</section>
		</div>
	);
}

function formatCount(n: number): string {
	if (n >= 10_000) return `${Math.floor(n / 1_000)}k+`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k+`;
	return String(n);
}

function buildStats(
	counts: { total: number; standardEbooks: number; gutenberg: number } | null,
): { value: string; label: string }[] {
	const total = counts ? formatCount(counts.total) : "80k+";
	const se = counts ? formatCount(counts.standardEbooks) : "1,400+";
	return [
		{ value: total, label: "Free classics in the library" },
		{ value: se, label: "Hand-typeset Standard Ebooks" },
		{ value: "1000 WPM", label: "Top reading speed" },
		{ value: "Free", label: "No account, no subscription" },
	];
}

const appFeatures: { icon: LucideIcon; label: string }[] = [
	{ icon: Library, label: "EPUB & TXT library" },
	{ icon: BookOpen, label: "Built-in reader" },
	{ icon: Zap, label: "Up to 1000 WPM" },
	{ icon: Bluetooth, label: "BLE sync (optional)" },
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
		description:
			"Automatic Bluetooth pairing. Your book, position and settings stay in sync both ways.",
	},
];

const deviceFeatures: { icon: LucideIcon; label: string }[] = [
	{ icon: Monitor, label: "AMOLED or TFT display" },
	{ icon: Power, label: "Single button operation" },
	{ icon: Battery, label: "Long battery life" },
	{ icon: Bluetooth, label: "BLE sync to companion app" },
];
