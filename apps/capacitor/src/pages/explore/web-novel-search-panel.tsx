import { Button } from "@lesefluss/ui/button";
import { SearchX } from "lucide-react";
import type React from "react";
import { CARD_TITLE } from "@/components/card";
import { CloudflareChallenge } from "../../components/cloudflare-challenge";
import CoverImage from "../../components/cover-image";
import type { ViewMode } from "../../components/view-mode-toggle";
import { queryHooks } from "../../services/db/hooks";
import {
	normalizeSeriesUrl,
	type PopularWindow,
	type ProviderId,
	providerCapabilities,
	providerLabel,
	type SearchResult,
	type SeriesStatus,
} from "../../services/serial-scrapers";
import { EmptyState, ErrorState } from "../_shared/load-states";
import { InLibraryBadge, LengthText, QuickAddButton } from "./card-badges";
import { describeLength } from "./length";
import ProviderCover from "./provider-cover";
import { CardGridSkeleton, EXPLORE_GRID_CLASS } from "./skeletons";
import { useReadingSpeed } from "./use-reading-speed";
import { useWebNovelImport } from "./use-web-novel-import";
import { WebNovelCard, webNovelCardExtraLines } from "./web-novel-card";
import { chapterFallback, webNovelLength } from "./web-novel-facts";

interface Props {
	query: string;
	/** When set, fan-out is filtered to a single provider. */
	provider?: ProviderId;
	/** Only applied when the selected provider supports it. */
	status?: SeriesStatus;
	popularWindow?: PopularWindow;
	viewMode: ViewMode;
	onPick: (result: SearchResult) => void;
}

export const WebNovelSearchPanel: React.FC<Props> = ({
	query,
	provider,
	status,
	popularWindow,
	viewMode,
	onPick,
}) => {
	const trimmed = query.trim();
	const caps = providerCapabilities(provider);
	const isPaged = !!provider && !!caps.searchPaging;
	const { data, isLoading, isFetching, isError, error, refetch } = queryHooks.useSearchSerials(
		isPaged ? "" : query,
		{ provider },
	);

	if (!trimmed) {
		return (
			<PopularShelf
				provider={provider}
				window={caps.popularWindows?.length ? popularWindow : undefined}
				viewMode={viewMode}
				onPick={onPick}
			/>
		);
	}
	if (provider && isPaged) {
		return (
			<PagedSearch
				query={query}
				provider={provider}
				status={caps.statusFilter ? status : undefined}
				viewMode={viewMode}
				onPick={onPick}
			/>
		);
	}

	if (isLoading || isFetching || (!data && !isError)) {
		return <PanelSkeleton viewMode={viewMode} showProvider={!provider} />;
	}

	if (isError || !data) return <ErrorState error={error} onRetry={refetch} />;

	const { results, failedProviders, challengeProviders } = data;

	if (results.length === 0 && failedProviders.length > 0 && challengeProviders.length === 0) {
		return (
			<ErrorState
				message={`No results. Some providers were unavailable (${providerLabels(failedProviders)}).`}
				onRetry={refetch}
			/>
		);
	}

	if (results.length === 0 && challengeProviders.length === 0) {
		return (
			<EmptyState icon={SearchX}>No results for "{trimmed}". Try a different title.</EmptyState>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			{challengeProviders.length > 0 && (
				<CloudflareChallenge providers={challengeProviders} onResolved={refetch} />
			)}
			<UnavailableProviders providers={failedProviders} />
			{results.length > 0 && (
				<ResultsLayout results={results} viewMode={viewMode} provider={provider} onPick={onPick} />
			)}
		</div>
	);
};

/** One provider's results with "Load more"; a short page or one with nothing new ends it. */
const PagedSearch: React.FC<{
	query: string;
	provider: ProviderId;
	status?: SeriesStatus;
	viewMode: ViewMode;
	onPick: (result: SearchResult) => void;
}> = ({ query, provider, status, viewMode, onPick }) => {
	const pages = queryHooks.useSearchSerialPages(query, { provider, status, enabled: true });
	if (pages.isPending) return <PanelSkeleton viewMode={viewMode} showProvider={false} />;
	if (pages.isError && !pages.data) {
		return <ErrorState error={pages.error} onRetry={() => pages.refetch()} />;
	}
	const all = pages.data.pages;
	const seen = new Set<string>();
	const results = all
		.flatMap((p) => p.results)
		.filter((r) => {
			const key = normalizeSeriesUrl(r.sourceUrl);
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	const challengeProviders = [...new Set(all.flatMap((p) => p.challengeProviders))];
	const lastFailed = (all[all.length - 1]?.failedProviders.length ?? 0) > 0;

	if (results.length === 0 && lastFailed && challengeProviders.length === 0) {
		return (
			<ErrorState
				message={`${providerLabel(provider)} didn't respond.`}
				onRetry={() => pages.refetch()}
			/>
		);
	}
	if (results.length === 0 && challengeProviders.length === 0) {
		return (
			<EmptyState icon={SearchX}>
				No results for "{query.trim()}". Try a different title.
			</EmptyState>
		);
	}
	return (
		<div className="flex flex-col gap-3">
			{challengeProviders.length > 0 && (
				<CloudflareChallenge providers={challengeProviders} onResolved={() => pages.refetch()} />
			)}
			{results.length > 0 && (
				<ResultsLayout results={results} viewMode={viewMode} provider={provider} onPick={onPick} />
			)}
			{lastFailed && results.length > 0 && (
				<ErrorState
					message="The next page didn't load."
					onRetry={() => pages.refetch()}
					className="mt-0 p-4"
				/>
			)}
			{pages.hasNextPage && (
				<Button
					variant="outline"
					className="self-center"
					onClick={() => pages.fetchNextPage()}
					disabled={pages.isFetchingNextPage}
				>
					{pages.isFetchingNextPage ? "Loading..." : "Load more"}
				</Button>
			)}
		</div>
	);
};

const PopularShelf: React.FC<{
	provider?: ProviderId;
	window?: PopularWindow;
	viewMode: ViewMode;
	onPick: (result: SearchResult) => void;
}> = ({ provider, window, viewMode, onPick }) => {
	const { data, isLoading, isFetching, isError, error, refetch } = queryHooks.usePopularSerials(
		provider,
		window,
	);

	if (isLoading || isFetching || (!data && !isError)) {
		return <PanelSkeleton viewMode={viewMode} showProvider={!provider} />;
	}
	if (isError || !data) {
		return <ErrorState error={error} message="Failed to load popular series." onRetry={refetch} />;
	}

	if (
		data.results.length === 0 &&
		data.failedProviders.length > 0 &&
		data.challengeProviders.length === 0
	) {
		return (
			<ErrorState
				message={`Failed to load popular series (${providerLabels(data.failedProviders)}).`}
				onRetry={refetch}
			/>
		);
	}

	if (data.results.length === 0 && data.challengeProviders.length === 0) return null;

	return (
		<div className="flex flex-col gap-3">
			{data.challengeProviders.length > 0 && (
				<CloudflareChallenge providers={data.challengeProviders} onResolved={refetch} />
			)}
			<UnavailableProviders providers={data.failedProviders} />
			{data.results.length > 0 && (
				<ResultsLayout
					results={data.results}
					viewMode={viewMode}
					provider={provider}
					onPick={onPick}
				/>
			)}
		</div>
	);
};

const providerLabels = (providers: ProviderId[]) => providers.map(providerLabel).join(", ");

const UnavailableProviders: React.FC<{ providers: ProviderId[] }> = ({ providers }) =>
	providers.length > 0 ? (
		<div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-warning text-xs">
			Some providers unavailable: {providerLabels(providers)}
		</div>
	) : null;

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
		<div className={EXPLORE_GRID_CLASS}>
			{results.map((r) => (
				<WebNovelCard key={r.sourceUrl} result={r} onPick={onPick} showProvider={!provider} />
			))}
		</div>
	);
};

const ResultListItem: React.FC<{
	result: SearchResult;
	isAo3Only: boolean;
	onPick: (result: SearchResult) => void;
}> = ({ result, isAo3Only, onPick }) => {
	const quickAdd = useWebNovelImport(result.sourceUrl);
	const canQuickAdd = quickAdd.isMembershipKnown && !quickAdd.isInLibrary;
	const { wpm } = useReadingSpeed();
	const lengthLabels = describeLength(webNovelLength(result.details), wpm);
	const chapters = chapterFallback(result);
	return (
		<div
			className="flex items-center gap-2"
			data-testid="web-novel-card"
			data-in-library={quickAdd.isInLibrary}
		>
			<button
				type="button"
				onClick={() => onPick(result)}
				className="flex min-w-0 flex-1 cursor-pointer select-none items-center gap-3 border-0 bg-transparent px-0 py-3 text-left text-foreground active:opacity-70"
			>
				{!(isAo3Only && result.provider === "ao3") && (
					<div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-sm border border-border bg-muted">
						<CoverImage
							src={result.coverImage}
							alt={result.title}
							fallback={<ProviderCover result={result} compact />}
						/>
					</div>
				)}
				<div className="min-w-0 flex-1">
					<div className={CARD_TITLE}>{result.title}</div>
					{result.author && (
						<div className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-muted-foreground text-xs">
							{result.author}
						</div>
					)}
					<div className="mt-1 flex items-center gap-2">
						<span className="rounded-sm bg-foreground px-1.5 py-0.5 font-semibold text-2xs text-background uppercase tracking-wide">
							{result.provider}
						</span>
						{(lengthLabels || chapters) && (
							<span className="text-muted-foreground text-xs">
								{lengthLabels ? <LengthText labels={lengthLabels} /> : chapters}
							</span>
						)}
						{quickAdd.isInLibrary && <InLibraryBadge />}
					</div>
				</div>
			</button>
			{canQuickAdd && (
				<QuickAddButton
					title={result.title}
					isAdding={quickAdd.isImporting}
					onAdd={() => quickAdd.start(result.title)}
					className="shrink-0"
				/>
			)}
		</div>
	);
};

const PanelSkeleton: React.FC<{ viewMode: ViewMode; showProvider: boolean }> = ({
	viewMode,
	showProvider,
}) => (
	<CardGridSkeleton
		layout={viewMode}
		count={viewMode === "grid" ? 12 : 6}
		extraLines={webNovelCardExtraLines(showProvider)}
	/>
);
