import { Button } from "@lesefluss/ui/button";
import { Input } from "@lesefluss/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@lesefluss/ui/select";
import { useRouter, useSearch } from "@tanstack/react-router";
import { Compass, Search, X } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { TabHeader } from "../../components/app-shell/tab-header";
import {
	CATALOG_ENABLED,
	type CatalogSearchOrder,
	type CatalogSearchResult,
} from "../../services/catalog/client";
import { useDebounced } from "../../utils/use-debounced";
import GenreChips from "./genre-chips";
import ExploreLanding from "./landing";
import ExploreSearchResults from "./search-results";

const LANG_OPTIONS = [
	{ value: "en", label: "English", short: "EN" },
	{ value: "de", label: "German", short: "DE" },
	{ value: "fr", label: "French", short: "FR" },
	{ value: "es", label: "Spanish", short: "ES" },
	{ value: "it", label: "Italian", short: "IT" },
	{ value: "all", label: "All languages", short: "ALL" },
] as const;

const LANG_STORAGE_KEY = "explore-lang";
const DEBOUNCE_MS = 300;

// Genre labels for the active-chip display. Kept in sync with
// apps/catalog/src/lib/genres.ts. Unknown ids fall back to the raw id.
const GENRE_LABELS: Record<string, string> = {
	fiction: "Fiction",
	"science-fiction": "Science Fiction",
	mystery: "Mystery",
	poetry: "Poetry",
	philosophy: "Philosophy",
	children: "Children",
	history: "History",
	drama: "Drama",
};

const Explore: React.FC = () => {
	const router = useRouter();
	const search = useSearch({ strict: false }) as { genre?: string };
	const genre = search.genre ?? null;

	const [query, setQuery] = useState("");
	const [isSearchOpen, setSearchOpen] = useState(false);
	const [lang, setLang] = useState<string>(() => localStorage.getItem(LANG_STORAGE_KEY) ?? "en");
	const [page, setPage] = useState(1);
	const debouncedQuery = useDebounced(query.trim(), DEBOUNCE_MS);
	const searchInputRef = useRef<HTMLInputElement>(null);

	const changePage = (next: number) => {
		setPage(next);
		// `body` is overflow:hidden, so window scrolling is a no-op here; the app
		// scrolls one container in AppShell.
		document
			.querySelector('[data-scroll-restoration-id="app-scroll"]')
			?.scrollTo({ top: 0, behavior: "smooth" });
	};

	// Popular ordering when genre-browsing without a text query, relevance otherwise.
	const order: CatalogSearchOrder = !debouncedQuery && genre ? "popular" : "relevance";

	useEffect(() => {
		localStorage.setItem(LANG_STORAGE_KEY, lang);
	}, [lang]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: deps drive the reset, not the body.
	useEffect(() => {
		setPage(1);
	}, [debouncedQuery, lang, genre, order]);

	useEffect(() => {
		if (isSearchOpen) {
			searchInputRef.current?.focus();
		}
	}, [isSearchOpen]);

	const showResults = debouncedQuery.length > 0 || genre !== null;

	const setGenre = (id: string | null) => {
		// A replace mints a new history key, so it never has a scroll entry to
		// restore and always falls through to scroll-to-top. That is right when the
		// subtree swaps between the landing page and the results list, and wrong
		// when only the chip selection changes above an already-scrolled list.
		const staysOnResults = showResults && id !== null;
		router.navigate({
			to: "/tabs/explore",
			search: id ? { genre: id } : {},
			replace: true,
			resetScroll: !staysOnResults,
		});
	};

	const openResult = (r: CatalogSearchResult) => {
		router.navigate({
			to: "/tabs/explore/book/$catalogId",
			params: { catalogId: r.id },
		});
	};

	if (!CATALOG_ENABLED) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background p-8">
				<p className="text-muted-foreground">
					Catalog is not configured (VITE_CATALOG_URL missing).
				</p>
			</div>
		);
	}

	return (
		<div className="bg-background">
			<TabHeader>
				{isSearchOpen ? (
					<>
						<Input
							ref={searchInputRef}
							type="search"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							onBlur={() => {
								// Collapse searchbar back to brand on empty dismiss. If there's
								// still a query the user is likely scrolling results, keep open.
								if (!query) setSearchOpen(false);
							}}
							placeholder="Search..."
							className="flex-1"
						/>
						<Button
							variant="ghost"
							size="icon"
							onClick={() => {
								setQuery("");
								setSearchOpen(false);
							}}
							aria-label="Close search"
						>
							<X />
						</Button>
					</>
				) : (
					<>
						<Compass className="size-5 shrink-0 text-muted-foreground" />
						<h1 className="m-0 flex-1 font-semibold text-base leading-none">Explore</h1>
						<Button
							variant="ghost"
							size="icon"
							onClick={() => setSearchOpen(true)}
							aria-label="Search"
						>
							<Search />
						</Button>
					</>
				)}
				<Select value={lang} onValueChange={setLang}>
					<SelectTrigger className="w-auto gap-1 border-0 bg-transparent shadow-none">
						<SelectValue />
					</SelectTrigger>
					<SelectContent align="end">
						{LANG_OPTIONS.map((o) => (
							<SelectItem key={o.value} value={o.value}>
								{o.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</TabHeader>
			{showResults ? (
				<>
					<GenreChips
						activeGenre={genre}
						activeLabel={genre ? GENRE_LABELS[genre] : undefined}
						onClear={() => setGenre(null)}
					/>
					<ExploreSearchResults
						q={debouncedQuery}
						lang={lang}
						genre={genre}
						order={order}
						page={page}
						onPageChange={changePage}
						onOpen={openResult}
					/>
				</>
			) : (
				<ExploreLanding lang={lang} onOpen={openResult} onGenreTap={setGenre} />
			)}
		</div>
	);
};

export default Explore;
