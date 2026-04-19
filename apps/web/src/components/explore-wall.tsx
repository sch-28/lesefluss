import { Link } from "@tanstack/react-router";
import { ChevronDown, Download, Sparkles } from "lucide-react";
import { useState } from "react";
import type { ExploreCover } from "~/lib/explore-covers";

type Props = {
	covers: ExploreCover[];
	variant?: "hero" | "section";
};

export function ExploreWall({ covers, variant = "section" }: Props) {
	const hasCovers = covers.length >= 8;
	const row1 = hasCovers ? covers.slice(0, Math.ceil(covers.length / 2)) : [];
	const row2 = hasCovers ? covers.slice(Math.ceil(covers.length / 2)) : [];
	const isHero = variant === "hero";

	return (
		<section
			className={`relative isolate overflow-hidden bg-[#0c0a0a] text-white ${
				isHero ? "flex items-center py-16" : "py-28"
			}`}
		>
			{/* Ambient glows */}
			<div
				aria-hidden
				className="-translate-x-1/2 absolute top-1/3 left-1/4 h-[520px] w-[520px] rounded-full bg-primary/30 blur-[120px]"
			/>
			<div
				aria-hidden
				className="absolute right-0 bottom-0 h-[420px] w-[420px] translate-x-1/3 rounded-full bg-[#4bb8d8]/20 blur-[120px]"
			/>

			{hasCovers && (
				<div
					aria-hidden
					className="-z-10 pointer-events-none absolute inset-0 flex flex-col justify-center gap-6 opacity-60 [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]"
				>
					<MarqueeRow covers={row1} duration={80} direction="left" />
					<MarqueeRow covers={row2} duration={95} direction="right" />
					<MarqueeRow covers={row1.slice().reverse()} duration={110} direction="left" />
				</div>
			)}

			<div
				className={`relative mx-auto max-w-4xl px-6 text-center ${isHero ? "py-12" : ""}`}
				data-aos="fade-up"
			>
				{isHero ? <HeroContent /> : <SectionContent />}
				<Attribution />
			</div>

			{isHero && (
				<div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce text-white/50">
					<ChevronDown className="h-6 w-6" />
				</div>
			)}
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
				Lesefluss is a speed-reading app for phone, web, and a pocket-sized ESP32 device — with a
				built-in library of free, beautifully typeset classics.
			</p>
			<div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
				<PrimaryButton to="/download">
					<Download className="h-4 w-4" />
					Get the app
				</PrimaryButton>
				<SecondaryButton href="/app/tabs/explore">Explore the library</SecondaryButton>
			</div>
		</>
	);
}

function SectionContent() {
	return (
		<>
			<Pill label="New — Explore" />
			<h2 className="mb-6 font-bold text-5xl leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
				A library of <GradientWord>free classics</GradientWord>.<br />
				Built right in.
			</h2>
			<p className="mx-auto mb-10 max-w-xl text-lg text-white/70 leading-relaxed">
				Browse thousands of public-domain books from Project Gutenberg and the beautifully typeset
				Standard Ebooks. Import any title in a tap — no account, no fuss.
			</p>
			<div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
				<PrimaryButton href="/app/tabs/explore">Explore the library</PrimaryButton>
			</div>
		</>
	);
}

function Attribution() {
	return (
		<p className="mt-8 text-white/45 text-sm">
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
		<div className="relative flex overflow-hidden">
			<div
				className="flex shrink-0 gap-5 pr-5"
				style={{
					animation: `explore-marquee-${direction} ${duration}s linear infinite`,
					width: "max-content",
				}}
			>
				{loop.map((c, i) => (
					<CoverTile key={`${c.id}-${i}`} cover={c} />
				))}
			</div>
		</div>
	);
}

function CoverTile({ cover }: { cover: ExploreCover }) {
	const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
	return (
		<div className="relative h-[220px] w-[150px] shrink-0 overflow-hidden rounded-md bg-white/5 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/10 sm:h-[240px] sm:w-[164px]">
			{state === "loading" && (
				<div
					aria-hidden
					className="absolute inset-0 animate-[explore-shimmer_1.4s_ease-in-out_infinite] bg-[linear-gradient(100deg,rgba(255,255,255,0.04)_10%,rgba(255,255,255,0.12)_40%,rgba(255,255,255,0.04)_70%)] bg-[length:200%_100%]"
				/>
			)}
			{state === "error" && (
				<div className="absolute inset-0 flex items-center justify-center font-semibold text-white/30 text-xs tracking-widest">
					BOOK
				</div>
			)}
			<img
				src={cover.coverUrl}
				alt=""
				loading="lazy"
				decoding="async"
				onLoad={() => setState("loaded")}
				onError={() => setState("error")}
				className={`h-full w-full object-cover transition-opacity duration-300 ${
					state === "loaded" ? "opacity-100" : "opacity-0"
				}`}
			/>
		</div>
	);
}
