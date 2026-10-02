import { Button } from "@lesefluss/ui/button";
import { Input } from "@lesefluss/ui/input";
import { useRouter } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import type React from "react";
import { useRef, useState } from "react";
import { PageHeader } from "../../components/app-shell/page-header";
import { type ViewMode, ViewModeToggle } from "../../components/view-mode-toggle";
import {
	type PopularWindow,
	type ProviderId,
	providerCapabilities,
	providerLabel,
	type SearchResult,
	type SeriesStatus,
} from "../../services/serial-scrapers";
import { previewCache } from "./preview-cache";
import { useQueryText } from "./use-query-text";
import { WebNovelSearchPanel } from "./web-novel-search-panel";
import { isVisibleProvider, VISIBLE_PROVIDERS } from "./web-novels-providers";

/**
 * Routed search page for web-novel discovery. Replaces the old library-side
 * <SerialSearchModal>. Lives at `/tabs/explore/web-novels` so back-navigation
 * from the preview page goes back to here, not all the way to the library.
 *
 * URL contract: `?provider=<id>` preselects a provider chip and `?q=` holds
 * the query, so back navigation and Explore's "See all" restore both. Updated
 * with `replace` so chip taps and typing don't grow the back stack.
 */
export type WebNovelsSearch = {
	provider?: string;
	q?: string;
	status?: SeriesStatus;
	window?: PopularWindow;
};

const STATUS_OPTIONS: readonly { value: SeriesStatus | undefined; label: string }[] = [
	{ value: undefined, label: "Any status" },
	{ value: "ongoing", label: "Ongoing" },
	{ value: "completed", label: "Completed" },
];
const WINDOW_LABELS: Record<PopularWindow, string> = {
	week: "This week",
	trending: "Trending",
	"all-time": "All time",
};

type Props = { search: WebNovelsSearch };

const WebNovels: React.FC<Props> = ({ search }) => {
	const router = useRouter();
	const rawProvider = search.provider;
	const provider = rawProvider && isVisibleProvider(rawProvider) ? rawProvider : undefined;

	const navigateSearch = (patch: WebNovelsSearch) => {
		router.navigate({
			to: "/tabs/explore/web-novels",
			// From the latest location, so a settling keystroke can't undo a chip tap.
			search: (prev) => ({ ...prev, ...patch }),
			replace: true,
			// A replace has no scroll entry to restore, so without this every chip
			// tap or settled keystroke would scroll the results back to the top.
			resetScroll: false,
		});
	};
	const { text: query, setText: setQuery } = useQueryText(
		search.q,
		(q) => navigateSearch({ q: q || undefined }),
		400,
	);
	const inputRef = useRef<HTMLInputElement>(null);
	const [viewMode, setViewMode] = useState<ViewMode>(provider === "ao3" ? "list" : "grid");
	const [prevProvider, setPrevProvider] = useState(provider);
	if (prevProvider !== provider) {
		setPrevProvider(provider);
		setViewMode(provider === "ao3" ? "list" : "grid");
	}

	// Filters are per provider, so switching provider drops them.
	const setProvider = (next?: ProviderId) =>
		navigateSearch({ provider: next, status: undefined, window: undefined });
	const caps = providerCapabilities(provider);
	const windows = caps.popularWindows ?? [];

	const dismissKeyboard = () => {
		inputRef.current?.blur();
	};

	const handlePick = (result: SearchResult) => {
		dismissKeyboard();
		previewCache.set(result);
		router.navigate({
			to: "/tabs/explore/web-novel-preview",
			search: { url: result.sourceUrl },
		});
	};

	return (
		<div className="bg-background">
			<PageHeader
				title="Web novels"
				icon={BookOpen}
				right={
					<ViewModeToggle
						viewMode={viewMode}
						onToggle={() => setViewMode((m) => (m === "grid" ? "list" : "grid"))}
					/>
				}
			/>
			<div className="mx-auto max-w-5xl px-4 pt-4 pb-20">
				<Input
					ref={inputRef}
					type="search"
					inputMode="search"
					enterKeyHint="search"
					autoCapitalize="off"
					autoCorrect="off"
					spellCheck={false}
					placeholder="e.g. The Wandering Inn, Cradle"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							dismissKeyboard();
						}
					}}
				/>

				<div className="mt-3 flex flex-wrap gap-2">
					<Button
						variant={!provider ? "default" : "outline"}
						size="sm"
						onClick={() => setProvider(undefined)}
					>
						All
					</Button>
					{VISIBLE_PROVIDERS.map((id) => (
						<Button
							key={id}
							variant={provider === id ? "default" : "outline"}
							size="sm"
							onClick={() => setProvider(id)}
						>
							{providerLabel(id)}
						</Button>
					))}
				</div>

				{caps.statusFilter && query.trim() && (
					<fieldset className="m-0 mt-2 flex flex-wrap gap-2 border-0 p-0" aria-label="Status">
						{STATUS_OPTIONS.map((o) => (
							<Button
								key={o.label}
								variant={search.status === o.value ? "secondary" : "ghost"}
								size="sm"
								onClick={() => navigateSearch({ status: o.value })}
							>
								{o.label}
							</Button>
						))}
					</fieldset>
				)}
				{windows.length > 0 && !query.trim() && (
					<fieldset className="m-0 mt-2 flex flex-wrap gap-2 border-0 p-0" aria-label="Popular">
						{windows.map((w) => (
							<Button
								key={w}
								variant={(search.window ?? windows[0]) === w ? "secondary" : "ghost"}
								size="sm"
								onClick={() => navigateSearch({ window: w })}
							>
								{WINDOW_LABELS[w]}
							</Button>
						))}
					</fieldset>
				)}

				<WebNovelSearchPanel
					query={query}
					provider={provider}
					status={search.status}
					popularWindow={search.window}
					viewMode={viewMode}
					onPick={handlePick}
				/>
			</div>
		</div>
	);
};

export default WebNovels;
