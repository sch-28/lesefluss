import { IonButton, IonIcon, IonSpinner, IonText } from "@ionic/react";
import type React from "react";
import { Capacitor } from "@capacitor/core";
import { alertCircleOutline, sadOutline, shieldCheckmarkOutline } from "ionicons/icons";
import CoverImage from "../../components/cover-image";
import type { ViewMode } from "../../components/view-mode-toggle";
import { queryHooks } from "../../services/db/hooks";
import {
	chapterCountLabel,
	type ProviderId,
	type SearchResult,
} from "../../services/serial-scrapers";
import { NativeHttp } from "../../services/serial-scrapers/native-http";
import { PROVIDER_CHALLENGE_URL } from "./web-novels-providers";

interface Props {
	query: string;
	/** When set, fan-out is filtered to a single provider. */
	provider?: ProviderId;
	viewMode: ViewMode;
	/** Called with the full chosen `SearchResult`. */
	onPick: (result: SearchResult) => void;
}

export const WebNovelSearchPanel: React.FC<Props> = ({ query, provider, viewMode, onPick }) => {
	const trimmed = query.trim();
	const { data, isLoading, isError, refetch } = queryHooks.useSearchSerials(query, { provider });

	if (!trimmed) return <PopularShelf provider={provider} viewMode={viewMode} onPick={onPick} />;

	if (isError) {
		return <ErrorState message="Search failed. Check your connection and try again." onRetry={refetch} />;
	}

	if (isLoading || !data) {
		return (
			<div className="flex items-center justify-center gap-2 p-8">
				<IonSpinner name="dots" />
				<IonText color="medium" className="text-sm">
					Searching providers…
				</IonText>
			</div>
		);
	}

	const { results, failedProviders, challengeProviders } = data;

	if (results.length === 0 && failedProviders.length > 0 && challengeProviders.length === 0) {
		return (
			<ErrorState
				message={`No results — some providers were unavailable (${failedProviders.join(", ")}). Try again.`}
				onRetry={refetch}
			/>
		);
	}

	if (results.length === 0 && challengeProviders.length === 0) {
		return <EmptyState>No results for "{trimmed}". Try a different title.</EmptyState>;
	}

	return (
		<div className="flex flex-col gap-3 pt-3">
			{challengeProviders.length > 0 && (
				<ChallengeBanner providers={challengeProviders} onResolved={refetch} />
			)}
			{failedProviders.length > 0 && (
				<div className="rounded-md border border-[var(--ion-color-warning,#f0a020)] bg-[var(--ion-color-warning-tint,#fff7e6)] px-3 py-2 text-[var(--ion-color-warning-shade,#a07000)] text-xs">
					Some providers unavailable: {failedProviders.join(", ")}
				</div>
			)}
			{results.length > 0 && (
				<ResultsLayout results={results} viewMode={viewMode} provider={provider} onPick={onPick} />
			)}
			{results.length === 0 && challengeProviders.length > 0 && (
				<EmptyState>Verify to load results from blocked providers.</EmptyState>
			)}
		</div>
	);
};

const PopularShelf: React.FC<{
	provider?: ProviderId;
	viewMode: ViewMode;
	onPick: (result: SearchResult) => void;
}> = ({ provider, viewMode, onPick }) => {
	const { data, isLoading, isError, refetch } = queryHooks.usePopularSerials(provider);

	if (isLoading) {
		return (
			<div className="flex items-center justify-center gap-2 p-8">
				<IonSpinner name="dots" />
				<IonText color="medium" className="text-sm">
					Loading popular…
				</IonText>
			</div>
		);
	}

	if (isError) {
		return <ErrorState message="Failed to load popular series." onRetry={refetch} />;
	}

	if (!data) return null;

	if (data.results.length === 0 && data.failedProviders.length > 0 && data.challengeProviders.length === 0) {
		return (
			<ErrorState
				message={`Failed to load popular series (${data.failedProviders.join(", ")}).`}
				onRetry={refetch}
			/>
		);
	}

	if (data.results.length === 0 && data.challengeProviders.length === 0) return null;

	return (
		<div className="flex flex-col gap-3 pt-3">
			{data.challengeProviders.length > 0 && (
				<ChallengeBanner providers={data.challengeProviders} onResolved={refetch} />
			)}
			{data.results.length > 0 && (
				<ResultsLayout results={data.results} viewMode={viewMode} provider={provider} onPick={onPick} />
			)}
		</div>
	);
};

const ResultsLayout: React.FC<{
	results: SearchResult[];
	viewMode: ViewMode;
	provider?: ProviderId;
	onPick: (result: SearchResult) => void;
}> = ({ results, viewMode, provider, onPick }) => {
	if (viewMode === "list") {
		const isAo3Only = provider === "ao3";
		return (
			<div className="flex flex-col gap-2">
				{results.map((r) => (
					<ResultListItem key={r.sourceUrl} result={r} isAo3Only={isAo3Only} onPick={onPick} />
				))}
			</div>
		);
	}
	return (
		<div className="grid grid-cols-3 gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
			{results.map((r) => (
				<ResultCard key={r.sourceUrl} result={r} onPick={onPick} />
			))}
		</div>
	);
};

const ResultListItem: React.FC<{
	result: SearchResult;
	isAo3Only: boolean;
	onPick: (result: SearchResult) => void;
}> = ({ result, isAo3Only, onPick }) => (
	<button
		type="button"
		onClick={() => onPick(result)}
		className="flex w-full cursor-pointer select-none items-center gap-3 border-0 bg-transparent px-0 py-3 text-left text-[color:var(--ion-text-color,#000)] active:opacity-70"
	>
		{!(isAo3Only && result.provider === "ao3") && (
			<div className="relative h-16 w-12 shrink-0 overflow-hidden rounded border border-[var(--ion-border-color,#d9d9d9)] bg-[var(--ion-color-light,#f0f0f0)]">
				<CoverImage
					src={result.coverImage}
					alt={result.title}
					fallback={
						<span className="font-semibold text-[#bbb] text-[0.6rem] uppercase tracking-wide">
							{result.provider}
						</span>
					}
				/>
			</div>
		)}
		<div className="min-w-0 flex-1">
			<div className="overflow-hidden text-ellipsis font-semibold text-[0.9rem] leading-[1.2] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box]">
				{result.title}
			</div>
			{result.author && (
				<div className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-[#888] text-[0.8rem]">
					{result.author}
				</div>
			)}
			<div className="mt-1 flex items-center gap-2">
				<span className="rounded-sm bg-black px-1.5 py-0.5 font-semibold text-[0.6rem] text-white uppercase tracking-wide">
					{result.provider}
				</span>
				{result.chapterCount != null && (
					<span className="text-[#888] text-[0.75rem]">
						{chapterCountLabel(result.chapterCount)}
					</span>
				)}
			</div>
		</div>
	</button>
);

const iconSmStyle = { fontSize: "1rem" };
const iconLgStyle = { fontSize: "2rem" };
const noMarginStyle = { margin: 0 };

const ChallengeBanner: React.FC<{ providers: ProviderId[]; onResolved: () => void }> = ({
	providers,
	onResolved,
}) => {
	if (!Capacitor.isNativePlatform()) return null;
	return (
		<div className="flex flex-col gap-2 rounded-md border border-[var(--ion-border-color,#c8c7cc)] bg-[var(--ion-card-background,#ffffff)] px-3 py-2">
			<div className="flex items-center gap-1.5 text-[color:var(--ion-text-color,#000000)] text-xs font-semibold">
				<IonIcon icon={shieldCheckmarkOutline} style={iconSmStyle} />
				Cloudflare verification required
			</div>
			<div className="flex flex-wrap gap-2">
				{providers.map((p) => {
					const challengeUrl = PROVIDER_CHALLENGE_URL[p];
					if (!challengeUrl) return null;
					return (
						<IonButton
							key={p}
							size="small"
							fill="outline"
							color="dark"
							onClick={() =>
								NativeHttp.openChallenge({ url: challengeUrl, userAgent: navigator.userAgent })
									.then(onResolved)
									.catch(() => { /* user dismissed the challenge — nothing to do */ })
							}
						>
							Verify {p}
						</IonButton>
					);
				})}
			</div>
		</div>
	);
};

const ErrorState: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
	<div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
		<IonIcon icon={alertCircleOutline} style={iconLgStyle} color="medium" />
		<IonText color="medium">
			<p style={noMarginStyle}>{message}</p>
		</IonText>
		{onRetry && (
			<IonButton fill="clear" size="small" onClick={onRetry}>
				Retry
			</IonButton>
		)}
	</div>
);

const EmptyState: React.FC<{ children: React.ReactNode }> = ({ children }) => (
	<div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
		<IonIcon icon={sadOutline} style={iconLgStyle} color="medium" />
		<IonText color="medium">
			<p style={noMarginStyle}>{children}</p>
		</IonText>
	</div>
);

/**
 * Vertical card mirroring `pages/explore/result-card.tsx` (`BookCard`-style
 * rhythm). Aspect-2/3 cover, provider chip in the top-right corner,
 * 2-line title clamp + author below.
 */
const ResultCard: React.FC<{
	result: SearchResult;
	onPick: (result: SearchResult) => void;
}> = ({ result, onPick }) => (
	<button
		type="button"
		onClick={() => onPick(result)}
		className="flex w-full cursor-pointer select-none flex-col border-0 bg-transparent p-0 text-left text-[color:var(--ion-text-color,#000)] active:opacity-70"
	>
		<div className="relative aspect-2/3 w-full overflow-hidden rounded-md border border-[var(--ion-border-color,#d9d9d9)] bg-[var(--ion-color-light,#f0f0f0)]">
			<CoverImage
				src={result.coverImage}
				alt={result.title}
				fallback={
					<span className="font-semibold text-[#bbb] text-[0.6rem] uppercase tracking-wide">
						{result.provider}
					</span>
				}
			/>
			<span className="absolute top-1.5 right-1.5 rounded-sm bg-black px-1.5 py-0.5 font-semibold text-[0.6rem] text-white uppercase tracking-wide">
				{result.provider}
			</span>
		</div>

		<div className="px-0.5 pt-1">
			<div className="overflow-hidden text-ellipsis font-semibold text-[0.85rem] leading-[1.2] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box]">
				{result.title}
			</div>
			{result.author && (
				<div className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-[#888] text-[0.75rem]">
					{result.author}
				</div>
			)}
			{result.chapterCount != null && (
				<div className="mt-0.5 text-[#888] text-[0.7rem]">
					{chapterCountLabel(result.chapterCount)}
				</div>
			)}
		</div>
	</button>
);
