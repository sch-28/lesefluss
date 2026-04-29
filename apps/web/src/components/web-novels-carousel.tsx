import type { CSSProperties } from "react";
import { type ProviderCover, type ProviderId, providerCovers } from "~/lib/provider-covers";

type Provider = {
	id: ProviderId;
	name: string;
	tagline: string;
	color: string;
};

const providers: Provider[] = [
	{
		id: "royalroad",
		name: "Royal Road",
		tagline: "LitRPG, progression and fantasy",
		color: "#1d4f1d",
	},
	{
		id: "wuxiaworld",
		name: "Wuxiaworld",
		tagline: "Translated xianxia and cultivation",
		color: "#5e2a82",
	},
	{
		id: "scribblehub",
		name: "ScribbleHub",
		tagline: "Original web fiction",
		color: "#1f5f99",
	},
	{
		id: "ao3",
		name: "Archive of Our Own",
		tagline: "Fanfiction archive",
		color: "#990000",
	},
];

const FAN_ANGLES_BY_COUNT: Record<number, readonly number[]> = {
	1: [0],
	2: [-5, 5],
	3: [-9, 0, 9],
};
const COVER_W = 84;
const COVER_H = 120;
const COVER_OVERLAP = 52; // px each side of the center cover hidden by neighbour

const BACKDROP_STYLE: CSSProperties = {
	background: "radial-gradient(circle at 20% 0%, var(--brand) 0%, transparent 60%)",
};
const BRAND_TEXT_STYLE: CSSProperties = { color: "var(--brand)" };

export function WebNovelsCarousel() {
	return (
		<div className="-mx-6 sm:mx-0">
			<div className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-4 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4">
				{providers.map((p) => (
					<ProviderCard key={p.id} provider={p} covers={providerCovers[p.id]} />
				))}
			</div>
		</div>
	);
}

function ProviderCard({ provider, covers }: { provider: Provider; covers: ProviderCover[] }) {
	const cardStyle = { "--brand": provider.color } as CSSProperties;
	const isAo3 = provider.id === "ao3";

	return (
		<div
			style={cardStyle}
			className="group relative w-[70%] shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-card transition-all hover:-translate-y-1 hover:shadow-lg sm:w-auto"
		>
			<div
				aria-hidden
				className="absolute inset-0 opacity-[0.07] transition-opacity group-hover:opacity-[0.12]"
				style={BACKDROP_STYLE}
			/>
			<div className="relative flex h-36 items-end justify-center px-4 pt-5 pb-2">
				{isAo3 ? <Ao3Mark /> : <CoverFan covers={covers} />}
			</div>
			<div className="relative px-4 pt-4 pb-5 text-center">
				<p className="font-bold text-base leading-tight tracking-tight" style={BRAND_TEXT_STYLE}>
					{provider.name}
				</p>
				<p className="mt-1 text-muted-foreground text-xs leading-snug">{provider.tagline}</p>
			</div>
		</div>
	);
}

function CoverFan({ covers }: { covers: ProviderCover[] }) {
	const items = covers.slice(0, 3);
	const angles = FAN_ANGLES_BY_COUNT[items.length] ?? [0];

	return (
		<div className="flex h-full w-full items-end justify-center">
			{items.map((c, i) => (
				<img
					key={c.slug}
					src={c.coverUrl}
					alt={c.title}
					loading="lazy"
					decoding="async"
					width={COVER_W}
					height={COVER_H}
					className="h-[120px] w-[84px] rounded-md border border-black/10 object-cover shadow-md transition-transform duration-300"
					style={{
						marginLeft: i === 0 ? 0 : `-${COVER_OVERLAP}px`,
						transform: `rotate(${angles[i]}deg)`,
						zIndex: i === 1 ? 2 : 1,
					}}
				/>
			))}
		</div>
	);
}

function Ao3Mark() {
	return (
		<div className="flex h-full w-full items-center justify-center">
			<div className="text-center" style={BRAND_TEXT_STYLE}>
				<p className="font-bold text-4xl leading-none tracking-tight">AO3</p>
				<p className="mt-2 font-semibold text-[9px] uppercase tracking-[0.2em] opacity-70">
					Archive of Our Own
				</p>
			</div>
		</div>
	);
}
