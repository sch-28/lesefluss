import { Button } from "@lesefluss/ui/button";
import { useRouter } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type React from "react";
import type { CSSProperties } from "react";
import { useCallback } from "react";
import { type ProviderId, providerLabel } from "../../services/serial-scrapers";
import { type ProviderCover, providerCovers } from "./provider-covers";
import {
	PROVIDER_BRAND_COLOR,
	PROVIDER_CARD_LABEL,
	PROVIDER_SUBTITLE,
	VISIBLE_PROVIDERS,
} from "./web-novels-providers";

const FAN_ANGLES_BY_COUNT: Record<number, readonly number[]> = {
	1: [0],
	2: [-5, 5],
	3: [-9, 0, 9],
};
const COVER_W = 84;
const COVER_H = 120;
const COVER_OVERLAP = 52;

const WebNovelsSection: React.FC = () => {
	const router = useRouter();

	const handleBrowseAll = useCallback(() => {
		router.navigate({ to: "/tabs/explore/web-novels" });
	}, [router]);
	const handleProviderTap = useCallback(
		(id: ProviderId) =>
			router.navigate({ to: "/tabs/explore/web-novels", search: { provider: id } }),
		[router],
	);

	return (
		<section className="mb-6">
			<header className="mb-2 flex items-center justify-between">
				<h2 className="m-0 font-semibold text-[0.95rem]">Web novels</h2>
				<Button
					variant="ghost"
					size="sm"
					onClick={handleBrowseAll}
					aria-label="Browse all web novels"
				>
					Browse
					<ChevronRight />
				</Button>
			</header>
			<div className="-mx-1 flex gap-3 overflow-x-auto px-1 pt-2 pb-5">
				{VISIBLE_PROVIDERS.map((id) => (
					<ProviderCard
						key={id}
						id={id}
						label={PROVIDER_CARD_LABEL[id] ?? providerLabel(id)}
						subtitle={PROVIDER_SUBTITLE[id] ?? "Web fiction"}
						color={PROVIDER_BRAND_COLOR[id] ?? "#444"}
						covers={providerCovers[id] ?? []}
						onTap={handleProviderTap}
					/>
				))}
			</div>
		</section>
	);
};

type ProviderCardProps = {
	id: ProviderId;
	label: string;
	subtitle: string;
	color: string;
	covers: ProviderCover[];
	onTap: (id: ProviderId) => void;
};

function ProviderCard({ id, label, subtitle, color, covers, onTap }: ProviderCardProps) {
	const isAo3 = id === "ao3";
	const handleClick = useCallback(() => onTap(id), [onTap, id]);

	return (
		<button
			type="button"
			onClick={handleClick}
			style={{ "--brand": color } as CSSProperties}
			className="relative w-44 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-border bg-card text-left text-card-foreground transition-transform active:scale-95"
			aria-label={`Browse ${label}`}
		>
			<span
				aria-hidden
				className="absolute inset-x-0 top-0 h-24 opacity-15"
				style={{ background: "var(--brand)" }}
			/>
			<span className="relative flex h-32 items-end justify-center pt-4">
				{isAo3 ? <Ao3Mark label={label} /> : <CoverFan covers={covers} />}
			</span>
			<span className="relative block px-3 pt-3 pb-4">
				<span className="block font-semibold text-sm">{label}</span>
				<span className="mt-0.5 block text-muted-foreground text-xs">{subtitle}</span>
			</span>
		</button>
	);
}

function CoverFan({ covers }: { covers: ProviderCover[] }) {
	const items = covers.slice(0, 3);
	const angles = FAN_ANGLES_BY_COUNT[items.length] ?? [0];

	return (
		<span className="flex h-full w-full items-end justify-center">
			{items.map((c, i) => (
				<img
					key={c.slug}
					src={c.coverUrl}
					alt={c.title}
					loading="lazy"
					decoding="async"
					width={COVER_W}
					height={COVER_H}
					className="rounded-sm border border-border shadow-sm"
					style={{
						marginLeft: i === 0 ? 0 : `-${COVER_OVERLAP}px`,
						transform: `rotate(${angles[i]}deg)`,
						zIndex: i === 1 ? 2 : 1,
					}}
				/>
			))}
		</span>
	);
}

function Ao3Mark({ label }: { label: string }) {
	return (
		<span className="flex flex-col items-center justify-end pb-2">
			<span className="font-serif text-3xl text-foreground">{label}</span>
			<span className="mt-1 text-muted-foreground text-xs">Archive of Our Own</span>
		</span>
	);
}

export default WebNovelsSection;
