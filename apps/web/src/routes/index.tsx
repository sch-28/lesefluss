import { createFileRoute, Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
	Battery,
	Bluetooth,
	BookOpen,
	ChevronsRight,
	Cloud,
	Download,
	Highlighter,
	Monitor,
	NotebookPen,
	Palette,
	Power,
	SlidersHorizontal,
	Type,
} from "lucide-react";
import { useEffect, useMemo } from "react";
import { ExploreWall } from "~/components/explore-wall";
import { HeroRsvp } from "~/components/hero-rsvp";
import { RsvpPreview } from "~/components/rsvp-preview";
import { Button } from "~/components/ui/button";
import { WebNovelsCarousel } from "~/components/web-novels-carousel";
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
				"Read books and web novels 2 to 4 times faster with RSVP. Import EPUB, PDF, or any URL. Browse free classics or follow web novels from AO3, Royal Road, ScribbleHub and Wuxiaworld. Web app, Android app, and an optional DIY ESP32 reader, all in sync.",
			path: "/",
		}),
		scripts: [softwareApplicationSchema],
	}),
});

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

	return (
		<div className="overflow-x-hidden">
			{/* ── 1. Hero ──────────────────────────────────────────────── */}
			<ExploreWall covers={covers} />

			{/* ── 2. Stats ─────────────────────────────────────────────── */}
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

			{/* ── 3. Read anything ─────────────────────────────────────── */}
			<section className="py-24">
				<div className="mx-auto max-w-5xl px-6">
					<div className="mx-auto mb-12 max-w-2xl text-center" data-aos="fade-up">
						<p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-widest">
							Your library
						</p>
						<h2 className="mb-5 font-bold text-3xl leading-tight sm:text-4xl">
							Read anything you can find
						</h2>
						<p className="text-muted-foreground leading-relaxed">
							EPUBs, PDFs, HTML, plain text, an article URL, or a page shared from your browser.
							Lesefluss pulls a clean reading copy and detects chapters and metadata automatically.
							Browse free classics on the Explore page, or follow web novels straight from the sites
							you already read.
						</p>
					</div>

					<div data-aos="fade-up" data-aos-delay="80">
						<WebNovelsCarousel />
					</div>
				</div>
			</section>

			{/* ── 4. Read it your way (bento) ──────────────────────────── */}
			<section className="bg-muted/40 py-24">
				<div className="mx-auto max-w-5xl px-6">
					<div className="mx-auto mb-12 max-w-2xl text-center" data-aos="fade-up">
						<p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-widest">
							The reader
						</p>
						<h2 className="mb-5 font-bold text-3xl leading-tight sm:text-4xl">Read it your way</h2>
						<p className="text-muted-foreground leading-relaxed">
							Small dials, not big switches. Set the reader the way you like, and forget it.
						</p>
					</div>

					<div className="grid gap-4 lg:grid-cols-2">
						{/* Hero card: RSVP showpiece with the phone preview */}
						<div
							className="relative flex flex-col rounded-2xl border border-border bg-card px-8 pt-8 pb-10"
							data-aos="fade-up"
						>
							<div className="text-center">
								<p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-[0.25em]">
									Rapid Serial Visual Presentation
								</p>
								<h3 className="mb-3 font-bold text-3xl leading-tight">
									Read <HeroRsvp />
								</h3>
								<p className="mx-auto max-w-md text-muted-foreground text-sm leading-relaxed">
									One word at a time, anchored on the focal letter. Eyes stop jumping, you read 2 to
									4 times faster.
								</p>
							</div>
							<div className="relative mt-10 flex flex-1 items-center justify-center">
								<div className="absolute inset-0 rounded-full bg-primary/10" style={glowStyle} />
								<div className="relative rotate-2">
									<RsvpPreview />
								</div>
							</div>
						</div>

						<div className="grid gap-4 sm:grid-cols-2">
							{bentoCards.map((card, i) => (
								<BentoCard key={card.title} {...card} aosDelay={(i + 1) * 60} />
							))}
						</div>
					</div>
				</div>
			</section>

			{/* ── 5. Device ────────────────────────────────────────────── */}
			<section className="py-20">
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
							<h2 className="mb-5 font-bold text-3xl leading-tight">Leave the phone behind</h2>
							<p className="mb-8 text-muted-foreground leading-relaxed">
								Pocket-sized ESP32 reader. AMOLED or TFT, single button, weeks of battery. Around
								€25 in parts.
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

			{/* ── 6. Open Source CTA ───────────────────────────────────── */}
			<section className="bg-foreground py-28 text-background">
				<div className="mx-auto max-w-3xl px-6 text-center" data-aos="fade-up">
					<p className="mb-3 font-semibold text-background/50 text-xs uppercase tracking-widest">
						Open source
					</p>
					<h2 className="mb-5 font-bold text-4xl text-background leading-tight">
						No subscription needed.
					</h2>
					<p className="mx-auto mb-10 max-w-lg text-background/65 leading-relaxed">
						The app is free. Read, import books, and sync your device. No account required, optional
						cloud sync available.
					</p>
					<div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
						<Button asChild className="h-auto px-8 py-3 font-semibold text-sm">
							<Link to="/download">
								<Download className="mr-2 h-4 w-4" />
								Download for Android
							</Link>
						</Button>
						<a
							href="/app"
							className="inline-flex items-center gap-2 rounded-md border-2 border-background/30 bg-transparent px-8 py-3 font-semibold text-background text-sm transition-colors hover:bg-background/10"
						>
							Try the web app →
						</a>
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

function BentoCard({
	icon: Icon,
	title,
	description,
	aosDelay,
}: {
	icon: LucideIcon;
	title: string;
	description: string;
	aosDelay: number;
}) {
	return (
		<div
			className="rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-1 hover:shadow-md"
			data-aos="fade-up"
			data-aos-delay={aosDelay}
		>
			<div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
				<Icon className="h-4 w-4 text-primary" />
			</div>
			<h3 className="mb-2 font-semibold">{title}</h3>
			<p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
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

const bentoCards: { icon: LucideIcon; title: string; description: string }[] = [
	{
		icon: BookOpen,
		title: "Page or scroll",
		description: "Read in pages, scroll continuously, or flick into RSVP. Switch any time.",
	},
	{
		icon: Palette,
		title: "Themes",
		description: "Dark, sepia, light. Easy on the eyes wherever you read.",
	},
	{
		icon: Type,
		title: "Typography",
		description: "Tweak font, line spacing, margins, even the size of the app itself.",
	},
	{
		icon: SlidersHorizontal,
		title: "Tunable speed",
		description: "Fine-tune WPM, punctuation pauses, acceleration, and the focal letter offset.",
	},
	{
		icon: Highlighter,
		title: "Highlights & dictionary",
		description: "Tap any word for a definition. Save passages with colored swatches.",
	},
	{
		icon: NotebookPen,
		title: "Per-book glossary",
		description: "Track people, places, and concepts. Matching words light up in the text.",
	},
	{
		icon: ChevronsRight,
		title: "Auto-advance",
		description:
			"Finish a chapter and the next one rolls in. New chapters appear in the background.",
	},
	{
		icon: Cloud,
		title: "Sync everywhere",
		description:
			"Sign in with Google, Discord, or email. Library, position and highlights follow you.",
	},
];

const deviceFeatures: { icon: LucideIcon; label: string }[] = [
	{ icon: Monitor, label: "AMOLED or TFT display" },
	{ icon: Power, label: "Single button operation" },
	{ icon: Battery, label: "Long battery life" },
	{ icon: Bluetooth, label: "BLE sync to companion app" },
];
