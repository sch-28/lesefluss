import { Link } from "@tanstack/react-router";
import { ChevronDown, Download, Sparkles } from "lucide-react";
import { useCallback, useState } from "react";
import type { ExploreCover } from "~/lib/explore-covers";

type Props = {
	covers: ExploreCover[];
	variant?: "hero" | "section";
};

export function ExploreWall({ covers }: Props) {
	const hasCovers = covers.length >= 12;
	const third = Math.ceil(covers.length / 3);
	const row1 = hasCovers ? covers.slice(0, third) : [];
	const row2 = hasCovers ? covers.slice(third, third * 2) : [];
	const row3 = hasCovers ? covers.slice(third * 2) : [];

	return (
		<section className="relative isolate bg-foreground text-white">
			{/* Rows in normal flow — they drive the section height, no clipping */}
			{hasCovers && (
				<div
					aria-hidden
					className="pointer-events-none relative z-10 flex flex-col gap-4 py-4 opacity-60 [mask-image:linear-gradient(to_right,transparent,black_3%,black_97%,transparent)]"
				>
					<MarqueeRow covers={row1} duration={80} direction="left" />
					<MarqueeRow covers={row2} duration={95} direction="right" />
					<MarqueeRow covers={row3} duration={110} direction="left" />
				</div>
			)}

			{/* Dark overlay for text legibility */}
			<div aria-hidden className="pointer-events-none absolute inset-0 z-10 bg-foreground/40" />

			{/* Content overlaid and centered on top of the rows */}
			<div className="absolute inset-0 z-20 flex items-center justify-center">
				<div
					className="relative mx-auto w-full max-w-4xl px-6 py-12 text-center"
					data-aos="fade-up"
				>
					<HeroContent />
					<Attribution />
				</div>
			</div>

			<div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce text-white">
				<ChevronDown className="h-6 w-6" />
			</div>
		</section>
	);
}

function Pill({ label }: { label: string }) {
	return (
		<p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 font-semibold text-white/70 text-xs uppercase tracking-[0.2em] backdrop-blur-sm">
			<Sparkles className="h-3.5 w-3.5" />
			{label}
		</p>
	);
}

function GradientWord({ children }: { children: React.ReactNode }) {
	return (
		<span className="bg-gradient-to-br from-primary via-primary to-[#f7a07a] bg-clip-text text-transparent">
			{children}
		</span>
	);
}

type PrimaryButtonProps = { children: React.ReactNode } & (
	| { to: "/download"; href?: never }
	| { href: string; to?: never }
);

function PrimaryButton(props: PrimaryButtonProps) {
	const cls =
		"inline-flex items-center gap-2 rounded-md bg-white px-8 py-3 font-semibold text-base text-black shadow-lg shadow-primary/20 transition hover:bg-white/90";
	if ("to" in props && props.to) {
		return (
			<Link to={props.to} className={cls}>
				{props.children}
			</Link>
		);
	}
	return (
		<a href={props.href} className={cls}>
			{props.children}
		</a>
	);
}

function SecondaryButton({ href, children }: { href: string; children: React.ReactNode }) {
	return (
		<a
			href={href}
			className="inline-flex items-center gap-2 rounded-md border-2 border-white/25 bg-transparent px-8 py-3 font-semibold text-base text-white transition hover:bg-white/10"
		>
			{children}
		</a>
	);
}

function HeroContent() {
	return (
		<>
			<Pill label="Speed reading, reinvented" />
			<h1 className="mb-6 font-bold text-5xl leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
				Read <GradientWord>faster</GradientWord>.<br />
				Read anywhere.
			</h1>
			<p className="mx-auto mb-10 max-w-xl text-lg text-white/75 leading-relaxed">
				Lesefluss is a speed-reading app for phone, web, and a pocket-sized ESP32 device. It also
				has a normal reader and a built-in library of free, beautifully typeset classics.
			</p>
			<div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
				<PrimaryButton to="/download">
					<Download className="h-4 w-4" />
					Download for Android
				</PrimaryButton>
				<SecondaryButton href="/app">Try the web app →</SecondaryButton>
			</div>
		</>
	);
}

function Attribution() {
	return (
		<p className="mt-8 text-sm text-white/45">
			Covers by{" "}
			<a
				href="https://standardebooks.org"
				target="_blank"
				rel="noopener noreferrer"
				className="text-white/70 underline decoration-white/20 underline-offset-4 hover:text-white"
			>
				Standard Ebooks
			</a>{" "}
			and{" "}
			<a
				href="https://www.gutenberg.org"
				target="_blank"
				rel="noopener noreferrer"
				className="text-white/70 underline decoration-white/20 underline-offset-4 hover:text-white"
			>
				Project Gutenberg
			</a>
		</p>
	);
}

function MarqueeRow({
	covers,
	duration,
	direction,
}: {
	covers: ExploreCover[];
	duration: number;
	direction: "left" | "right";
}) {
	// Duplicate list so the animated translate can loop seamlessly.
	const loop = [...covers, ...covers];
	return (
		<div className="relative flex overflow-x-clip">
			<div
				className="flex shrink-0 gap-5 pr-5"
				style={{
					animation: `explore-marquee-${direction} ${duration}s linear infinite`,
					width: "max-content",
				}}
			>
				{loop.map((c, i) => (
					<CoverTile key={`${c.id}-${String(i)}`} cover={c} />
				))}
			</div>
		</div>
	);
}

function CoverTile({ cover }: { cover: ExploreCover }) {
	const [state, setState] = useState<"loading" | "loaded" | "error">("loading");

	const imgRef = useCallback((el: HTMLImageElement | null) => {
		if (!el) return;
		if (el.complete) setState(el.naturalWidth > 0 ? "loaded" : "error");
	}, []);

	return (
		<div className="relative aspect-[2/3] w-[150px] shrink-0 overflow-hidden rounded-md bg-white/5 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/10 sm:w-[164px]">
			{state === "loading" && (
				<div
					aria-hidden
					className="absolute inset-0 animate-[explore-shimmer_1.4s_ease-in-out_infinite] bg-[length:200%_100%] bg-[linear-gradient(100deg,rgba(255,255,255,0.04)_10%,rgba(255,255,255,0.12)_40%,rgba(255,255,255,0.04)_70%)]"
				/>
			)}
			{state === "error" && (
				<div className="absolute inset-0 flex items-center justify-center font-semibold text-white/30 text-xs tracking-widest">
					BOOK
				</div>
			)}
			<img
				ref={imgRef}
				src={cover.coverUrl}
				alt=""
				decoding="async"
				fetchPriority="low"
				onLoad={() => setState("loaded")}
				onError={() => setState("error")}
				className={`block h-full w-full object-cover transition-opacity duration-300 ${
					state === "loaded" ? "opacity-100" : "opacity-0"
				}`}
			/>
		</div>
	);
}
