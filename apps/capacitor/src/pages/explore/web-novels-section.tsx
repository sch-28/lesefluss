import { IonIcon } from "@ionic/react";
import { chevronForwardOutline } from "ionicons/icons";
import type { CSSProperties } from "react";
import type React from "react";
import { useCallback } from "react";
import { useHistory } from "react-router-dom";
import { type ProviderId, providerLabel } from "../../services/serial-scrapers";
import {
	PROVIDER_CARD_LABEL,
	PROVIDER_CARD_STYLE,
	PROVIDER_ICON,
	PROVIDER_SUBTITLE,
	VISIBLE_PROVIDERS,
} from "./web-novels-providers";

const FALLBACK_BRAND_STYLE = { "--brand": "#444" } as CSSProperties;

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
			<div className="web-novels-card-row -mx-1 flex gap-3 overflow-x-auto px-1 pt-2 pb-5">
				{VISIBLE_PROVIDERS.map((id) => {
					const Icon = PROVIDER_ICON[id];
					const label = PROVIDER_CARD_LABEL[id] ?? providerLabel(id);
					return (
						<button
							key={id}
							type="button"
							onClick={() => handleProviderTap(id)}
							className="web-novels-card relative shrink-0 overflow-hidden border-0"
							style={PROVIDER_CARD_STYLE[id] ?? FALLBACK_BRAND_STYLE}
							aria-label={`Browse ${label}`}
						>
							<span className="relative flex h-full flex-col items-center justify-center gap-2.5 text-center">
								<span className="web-novels-card-badge flex h-12 w-12 items-center justify-center rounded-2xl">
									{Icon ? (
										<Icon width={22} height={22} strokeWidth={2.1} aria-hidden />
									) : null}
								</span>
								<span className="block">
									<span className="block font-semibold text-[0.92rem] leading-tight text-[var(--ion-text-color,#000)]">
										{label}
									</span>
									<span className="mt-1 block text-[0.7rem] leading-tight text-[var(--ion-color-medium,#888)]">
										{PROVIDER_SUBTITLE[id] ?? "Web fiction"}
									</span>
								</span>
							</span>
						</button>
					);
				})}
				<span className="web-novels-card web-novels-card--placeholder relative flex shrink-0 flex-col items-center justify-center text-[0.7rem] text-[var(--ion-color-medium,#888)]">
					<span>More</span>
					<span>coming soon</span>
				</span>
			</div>
		</section>
	);
};

export default WebNovelsSection;
