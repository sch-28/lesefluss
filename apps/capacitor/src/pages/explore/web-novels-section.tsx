import { IonIcon } from "@ionic/react";
import { chevronForwardOutline } from "ionicons/icons";
import type React from "react";
import type { CSSProperties } from "react";
import { useCallback } from "react";
import { useHistory } from "react-router-dom";
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
	const history = useHistory();

	const handleBrowseAll = useCallback(() => {
		history.push("/tabs/explore/web-novels");
	}, [history]);
	const handleProviderTap = useCallback(
		(id: ProviderId) => history.push(`/tabs/explore/web-novels?provider=${id}`),
		[history],
	);

	return (
		<section className="explore-shelf mb-6">
			<header className="mb-2 flex items-center justify-between">
				<h2 className="m-0 font-semibold text-[0.95rem]">Web novels</h2>
				<button
					type="button"
					onClick={handleBrowseAll}
					className="flex items-center gap-0.5 border-0 bg-transparent p-1 text-[0.85rem] text-[var(--ion-color-primary,#000)]"
					aria-label="Browse all web novels"
				>
					Browse
					<IonIcon icon={chevronForwardOutline} aria-hidden />
				</button>
			</header>
			<div className="explore-novels-row -mx-1 flex gap-3 overflow-x-auto px-1 pt-2 pb-5">
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
			className="explore-novel-card relative"
			aria-label={`Browse ${label}`}
		>
			<span aria-hidden className="explore-novel-card__backdrop" />
			<span className="explore-novel-card__art">
				{isAo3 ? <Ao3Mark label={label} /> : <CoverFan covers={covers} />}
			</span>
			<span className="relative block px-3 pt-3 pb-4">
				<span className="explore-novel-card__name block">{label}</span>
				<span className="explore-novel-card__tagline block">{subtitle}</span>
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
					className="explore-novel-card__cover"
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
		<span className="explore-novel-card__ao3">
			<span className="explore-novel-card__ao3-glyph">{label}</span>
			<span className="explore-novel-card__ao3-sub">Archive of Our Own</span>
		</span>
	);
}

export default WebNovelsSection;
