import { IonSpinner, IonText } from "@ionic/react";
import type React from "react";
import CoverImage from "../../components/cover-image";
import { queryHooks } from "../../services/db/hooks";
import {
	chapterCountLabel,
	type ProviderId,
	type SearchResult,
} from "../../services/serial-scrapers";

interface Props {
	/**
	 * Live (un-debounced) query string from the surrounding input. The
	 * `useSearchSerials` hook debounces internally, so passing every keystroke
	 * here is fine — the upstream call only fires once the user pauses.
	 */
	query: string;
	/** When set, fan-out is filtered to a single provider. */
	provider?: ProviderId;
	/** Called with the full chosen `SearchResult`. */
	onPick: (result: SearchResult) => void;
}

/**
 * Provider-fan-out search results, styled to match the explore page's
 * 3-column card grid (`pages/explore/result-card.tsx`). Each card is
 * theme-aware via Ion CSS variables so dark and sepia modes look right
 * without per-mode overrides.
 */
export const WebNovelSearchPanel: React.FC<Props> = ({ query, provider, onPick }) => {
	const trimmed = query.trim();
	const { data, isLoading, isError, error } = queryHooks.useSearchSerials(query, { provider });

	if (!trimmed) return null;

	if (isError) {
		return (
			<EmptyState>
				Search failed: {error instanceof Error ? error.message : "Unknown error"}
			</EmptyState>
		);
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

	const { results, failedProviders } = data;

	if (results.length === 0) {
		return <EmptyState>No results for "{trimmed}". Try a different title.</EmptyState>;
	}

	return (
		<div className="flex flex-col gap-3 pt-3">
			{failedProviders.length > 0 && (
				<div className="rounded-md border border-[var(--ion-color-warning,#f0a020)] bg-[var(--ion-color-warning-tint,#fff7e6)] px-3 py-2 text-[var(--ion-color-warning-shade,#a07000)] text-xs">
					Some providers unavailable: {failedProviders.join(", ")}
				</div>
			)}
			<div className="grid grid-cols-3 gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
				{results.map((r) => (
					<ResultCard key={r.sourceUrl} result={r} onPick={onPick} />
				))}
			</div>
		</div>
	);
};

const EmptyState: React.FC<{ children: React.ReactNode }> = ({ children }) => (
	<div className="flex flex-col items-center justify-center p-8 text-center">
		<IonText color="medium">
			<p style={{ margin: 0 }}>{children}</p>
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
