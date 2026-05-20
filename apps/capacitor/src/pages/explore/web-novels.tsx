import { useRouter, useSearch } from "@tanstack/react-router";
import { Button } from "@lesefluss/ui/button";
import { Input } from "@lesefluss/ui/input";
import { BookOpen } from "lucide-react";
import type React from "react";
import { useRef, useState } from "react";
import { PageHeader } from "../../components/app-shell/page-header";
import { type ViewMode, ViewModeToggle } from "../../components/view-mode-toggle";
import type { ProviderId, SearchResult } from "../../services/serial-scrapers";
import { providerLabel } from "../../services/serial-scrapers";
import { previewCache } from "./preview-cache";
import { WebNovelSearchPanel } from "./web-novel-search-panel";
import { isVisibleProvider, VISIBLE_PROVIDERS } from "./web-novels-providers";

/**
 * Routed search page for web-novel discovery. Replaces the old library-side
 * <SerialSearchModal>. Lives at `/tabs/explore/web-novels` so back-navigation
 * from the preview page goes back to here, not all the way to the library.
 *
 * URL contract: `?provider=<id>` preselects a provider chip. Updated via
 * `router.navigate({ replace: true })` so chip taps don't grow the back stack.
 */
const WebNovels: React.FC = () => {
	const router = useRouter();
	const search = useSearch({ strict: false }) as { provider?: string };
	const rawProvider = search.provider;
	const provider = rawProvider && isVisibleProvider(rawProvider) ? rawProvider : undefined;

	const [query, setQuery] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const [viewMode, setViewMode] = useState<ViewMode>(provider === "ao3" ? "list" : "grid");
	const [prevProvider, setPrevProvider] = useState(provider);
	if (prevProvider !== provider) {
		setPrevProvider(provider);
		setViewMode(provider === "ao3" ? "list" : "grid");
	}

	const setProvider = (next?: ProviderId) => {
		router.navigate({
			to: "/tabs/explore/web-novels",
			search: next ? { provider: next } : {},
			replace: true,
		});
	};

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
			<div className="mx-auto max-w-5xl px-4 pb-20 pt-4">
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

				<WebNovelSearchPanel
					query={query}
					provider={provider}
					viewMode={viewMode}
					onPick={handlePick}
				/>
			</div>
		</div>
	);
};

export default WebNovels;
