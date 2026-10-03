import { BUDDY_TRAILER_NOTE_READER } from "@lesefluss/core";
import { BUDDY_TRAILER_READER_TONES } from "@lesefluss/ui/buddy-trailer";
import { Button } from "@lesefluss/ui/button";
import { cn } from "@lesefluss/ui/utils";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
	Activity,
	Battery,
	Bluetooth,
	BookOpen,
	ChevronsRight,
	Cloud,
	EyeOff,
	Flame,
	Globe,
	Highlighter,
	Lock,
	Monitor,
	NotebookPen,
	Palette,
	Power,
	Puzzle,
	SlidersHorizontal,
	Smile,
	Type,
	Users,
} from "lucide-react";
import { useEffect, useMemo } from "react";
import { BuddyReadPreview } from "~/components/buddy-read-preview";
import { ExploreWall } from "~/components/explore-wall";
import { HeroRsvp } from "~/components/hero-rsvp";
import { GooglePlayIcon } from "~/components/icons/google-play";
import { RsvpPreview } from "~/components/rsvp-preview";
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

const chromeExtensionUrl = import.meta.env.VITE_CHROME_EXTENSION_URL?.trim() || null;
const firefoxExtensionUrl = import.meta.env.VITE_FIREFOX_EXTENSION_URL?.trim() || null;

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

			{/* ── 5. Read together ─────────────────────────────────────── */}
			<section className="py-20">
				<div className="mx-auto max-w-5xl px-6">
					<div className="grid gap-12 lg:grid-cols-2 lg:items-center">
						<div data-aos="fade-right" className="text-center lg:text-left">
							<p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-widest">
								Buddy reads
							</p>
							<h2 className="mb-5 font-bold text-3xl leading-tight sm:text-4xl">Read together</h2>
							<p className="mb-8 text-muted-foreground leading-relaxed">
								Pick a book with friends and watch each other move through it on one shared line.
								Leave notes on a chapter, react to the twist, and keep each other going. Everyone
								reads their own copy, in the mode they like.
							</p>
							<div className="mb-8 flex flex-wrap justify-center gap-2 lg:justify-start">
								{socialFeatures.map(({ icon: Icon, label }) => (
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
								<Button asChild className="h-auto px-6 py-2.5 font-semibold text-sm">
									<a href="/app/tabs/social">
										<Users className="mr-2 h-4 w-4" />
										Start a buddy read
									</a>
								</Button>
							</div>
						</div>

						<div className="relative mx-auto w-full max-w-[440px] py-6" data-aos="fade-left">
							<div className="absolute inset-0 rounded-full bg-primary/10" style={glowStyle} />
							<div className="relative -rotate-1 overflow-hidden rounded-3xl border border-border bg-card shadow-[0_30px_60px_-30px_rgba(24,24,27,0.35)]">
								<div aria-hidden="true" className="pointer-events-none absolute inset-0">
									<img
										src={PREVIEW_COVER.url}
										alt=""
										draggable={false}
										loading="lazy"
										decoding="async"
										className="absolute inset-0 size-full scale-150 object-cover opacity-25 blur-2xl"
									/>
									<div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,color-mix(in_oklch,var(--primary)_22%,transparent),transparent_60%)]" />
									<div className="absolute inset-0 bg-gradient-to-b from-card/30 via-35% via-card/80 to-80% to-card" />
								</div>
								<div className="relative p-4 sm:p-5">
									<div className="rounded-2xl border border-border bg-card/85 p-3.5 sm:p-4">
										<BuddyReadPreview coverUrl={PREVIEW_COVER.url} title={PREVIEW_COVER.title} />
									</div>
								</div>
							</div>
							<div className="relative -mt-4 ml-auto w-56 rotate-2 rounded-2xl border border-border bg-card p-3.5 text-left shadow-[0_18px_36px_-18px_rgba(24,24,27,0.35)] lg:absolute lg:-bottom-16 lg:-left-10 lg:mt-0">
								<div className="flex items-center gap-2">
									<span
										className={cn(
											"flex size-6 items-center justify-center rounded-full font-bold text-[10px]",
											BUDDY_TRAILER_READER_TONES[BUDDY_TRAILER_NOTE_READER],
										)}
									>
										{BUDDY_TRAILER_NOTE_READER[0]}
									</span>
									<span className="text-xs">
										<span className="font-semibold">{BUDDY_TRAILER_NOTE_READER}</span>
										<span className="text-muted-foreground"> · note in chapter 11</span>
									</span>
								</div>
								<p className="mt-2 text-[13px] leading-snug">"Did not see that coming. At all."</p>
								<span className="mt-2 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-semibold text-[11px]">
									<Flame className="h-3 w-3 text-primary" />2
								</span>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* ── 6. Android app ──────────────────────────────────────── */}
			<section className="py-20">
				<div className="mx-auto max-w-5xl px-6">
					<div className="grid gap-12 lg:grid-cols-2 lg:items-center">
						<div data-aos="fade-right" className="text-center lg:text-left">
							<p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-widest">
								Android app
							</p>
							<h2 className="mb-5 font-bold text-3xl leading-tight">Your library in your pocket</h2>
							<p className="mb-8 text-muted-foreground leading-relaxed">
								Import EPUB, PDF, HTML, Markdown, or plain text. Browse thousands of free classics.
								Read at up to 1000 WPM, fully offline. Optional cloud sync keeps your position
								across devices.
							</p>
							<div className="flex justify-center lg:justify-start">
								<Button asChild className="h-auto px-6 py-2.5 font-semibold text-sm">
									<Link to="/download">
										<GooglePlayIcon className="mr-2 h-4 w-4 fill-current" />
										Get on Android
									</Link>
								</Button>
							</div>
						</div>
						<div className="relative flex justify-center lg:justify-end" data-aos="fade-left">
							<div className="relative">
								<div className="absolute inset-0 rounded-full bg-primary/15" style={glowStyle} />
								<div className="relative mx-auto rotate-2" style={{ width: "260px" }}>
									<div
										className="rounded-[2.5rem] border-[3px] border-slate-300 bg-slate-200 p-[6px] shadow-xl"
										style={{ aspectRatio: "9 / 19.5" }}
									>
										<div className="relative z-10 mx-auto -mb-2 h-[14px] w-16 rounded-full bg-slate-800" />
										<div className="h-full overflow-hidden rounded-[2rem] bg-white p-3">
											<img
												src="/library.png"
												alt="Lesefluss Android app showing the library"
												loading="lazy"
												className="block h-full w-full object-cover object-top"
											/>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* ── 7. Device ────────────────────────────────────────────── */}
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

			{/* ── 8. Web app + Extension ───────────────────────────────── */}
			<section className="bg-muted/40 py-20">
				<div className="mx-auto max-w-5xl px-6">
					<div className="grid gap-4 lg:grid-cols-2">
						<div className="rounded-2xl border border-border bg-card p-6" data-aos="fade-up">
							<div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
								<Globe className="h-4 w-4 text-primary" />
							</div>
							<h3 className="mb-2 font-semibold">Web app</h3>
							<p className="mb-5 text-muted-foreground text-sm leading-relaxed">
								Same reader, same library, no install. Sign in to sync across devices, or read
								straight from the browser.
							</p>
							<a
								href="/app"
								className="inline-flex items-center gap-1.5 font-semibold text-foreground text-sm hover:underline"
							>
								Try the web app →
							</a>
						</div>

						<div
							className="rounded-2xl border border-border bg-card p-6"
							data-aos="fade-up"
							data-aos-delay="80"
						>
							<div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
								<Puzzle className="h-4 w-4 text-primary" />
							</div>
							<h3 className="mb-2 font-semibold">Browser extension</h3>
							<p className="mb-5 text-muted-foreground text-sm leading-relaxed">
								Save articles you find on the web straight into your library. One click, no copy and
								paste.
							</p>
							<div className="flex flex-wrap gap-2">
								<ExtensionStoreButton label="Chrome" url={chromeExtensionUrl} />
								<ExtensionStoreButton label="Firefox" url={firefoxExtensionUrl} />
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* ── 9. Open Source CTA ───────────────────────────────────── */}
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
					<div className="flex justify-center">
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

function ExtensionStoreButton({ label, url }: { label: string; url: string | null }) {
	if (url) {
		return (
			<a
				href={url}
				target="_blank"
				rel="noopener noreferrer"
				className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 font-semibold text-foreground text-sm transition-colors hover:border-foreground/30"
			>
				{label}
			</a>
		);
	}
	return (
		<span
			aria-disabled="true"
			className="inline-flex cursor-not-allowed items-center gap-2 rounded-md border border-border bg-background/50 px-4 py-2 font-semibold text-muted-foreground text-sm leading-none"
			title="Coming soon"
		>
			<span className="leading-none">{label}</span>
			<span className="rounded bg-muted px-1.5 py-0.5 font-semibold text-[10px] uppercase leading-none tracking-wider">
				Soon
			</span>
		</span>
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

/** A public-domain classic bundled with the site, so the preview needs no network. */
const PREVIEW_COVER = {
	url: "/covers/jane-austen__pride-and-prejudice.webp",
	title: "Pride and Prejudice",
};

const socialFeatures: { icon: LucideIcon; label: string }[] = [
	{ icon: Activity, label: "Live progress" },
	{ icon: EyeOff, label: "Spoiler-safe notes" },
	{ icon: Smile, label: "Reactions" },
	{ icon: Lock, label: "Invite-only" },
];

const deviceFeatures: { icon: LucideIcon; label: string }[] = [
	{ icon: Monitor, label: "AMOLED or TFT display" },
	{ icon: Power, label: "Single button operation" },
	{ icon: Battery, label: "Long battery life" },
	{ icon: Bluetooth, label: "BLE sync to companion app" },
];
