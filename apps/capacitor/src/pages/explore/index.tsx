import {
	IonButton,
	IonButtons,
	IonContent,
	IonHeader,
	IonIcon,
	IonPage,
	IonSearchbar,
	IonSelect,
	IonSelectOption,
	IonText,
	IonToolbar,
} from "@ionic/react";
import { searchOutline } from "ionicons/icons";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useHistory, useLocation } from "react-router-dom";
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
// Gives IonHeader / IonSearchbar time to mount before we poke setFocus().
// Short enough to feel instant; long enough to clear Ionic's portal animation.
const AUTOFOCUS_DELAY_MS = 60;

// Genre labels for the active-chip display. Kept in sync with
// apps/catalog/src/lib/genres.ts — if the catalog adds/removes a genre,
// update this map. Unknown ids fall back to the raw id.
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
	const history = useHistory();
	const location = useLocation();

	const [query, setQuery] = useState("");
	const [isSearchOpen, setSearchOpen] = useState(false);
	const [lang, setLang] = useState<string>(() => localStorage.getItem(LANG_STORAGE_KEY) ?? "en");
	const [page, setPage] = useState(1);
	const debouncedQuery = useDebounced(query.trim(), DEBOUNCE_MS);
	const searchbarRef = useRef<HTMLIonSearchbarElement>(null);
	const contentRef = useRef<HTMLIonContentElement>(null);

	// Classic pagination UX: every page change jumps back to the top of the
	// results list. IonContent manages its own scroll container, so
	// window.scrollTo is a no-op here — use the element's imperative API.
	const changePage = (next: number) => {
		setPage(next);
		contentRef.current?.scrollToTop(200);
	};

	// Hydrate genre from ?genre=... so deep-links like
	// /tabs/explore?genre=fiction (used by "See all →" shelves) land directly
	// in the filtered results view.
	const genre = new URLSearchParams(location.search).get("genre");

	// Popular ordering when genre-browsing without a text query, relevance otherwise.
	const order: CatalogSearchOrder = !debouncedQuery && genre ? "popular" : "relevance";

	useEffect(() => {
		localStorage.setItem(LANG_STORAGE_KEY, lang);
	}, [lang]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: deps drive the reset, not the body.
	useEffect(() => {
		setPage(1);
	}, [debouncedQuery, lang, genre, order]);

	// Autofocus the searchbar when opened.
	useEffect(() => {
		if (isSearchOpen) {
			const id = setTimeout(() => searchbarRef.current?.setFocus(), AUTOFOCUS_DELAY_MS);
			return () => clearTimeout(id);
		}
	}, [isSearchOpen]);

	// Reset to landing when the Explore tab is re-tapped (dispatched from
	// App.tsx's IonTabButton onClick). Clears the search input, closes the
	// searchbar, and drops any ?genre= filter from the URL.
	useEffect(() => {
		const handler = () => {
			setQuery("");
			setSearchOpen(false);
			history.replace("/tabs/explore");
		};
		window.addEventListener("lesefluss:explore-reset", handler);
		return () => window.removeEventListener("lesefluss:explore-reset", handler);
	}, [history]);

	const setGenre = (id: string | null) => {
		const params = new URLSearchParams(location.search);
		if (id) params.set("genre", id);
		else params.delete("genre");
		const search = params.toString();
		history.replace(`/tabs/explore${search ? `?${search}` : ""}`);
	};

	const openResult = (r: CatalogSearchResult) => {
		history.push(`/tabs/explore/book/${encodeURIComponent(r.id)}`);
	};

	if (!CATALOG_ENABLED) {
		return (
			<IonPage>
				<IonContent className="ion-padding">
					<IonText color="medium">
						<p>Catalog is not configured (VITE_CATALOG_URL missing).</p>
					</IonText>
				</IonContent>
			</IonPage>
		);
	}

	const showResults = debouncedQuery.length > 0 || genre !== null;
	const langShort = LANG_OPTIONS.find((o) => o.value === lang)?.short ?? lang.toUpperCase();

	return (
		<IonPage>
			<IonHeader class="ion-no-border">
				<IonToolbar>
					<div className="explore-toolbar">
						{isSearchOpen ? (
							<IonSearchbar
								ref={searchbarRef}
								value={query}
								onIonInput={(e) => setQuery(e.detail.value ?? "")}
								onIonBlur={() => {
									// Collapse the searchbar back to the brand when the user
									// dismisses it with an empty input. If there's still a
									// query they're likely scrolling results — keep it open.
									if (!query) setSearchOpen(false);
								}}
								placeholder="Search..."
								debounce={0}
								className="explore-searchbar"
							/>
						) : (
							<div className="app-brand">
								<img src="/logo.png" alt="" />
								<span>Lesefluss</span>
							</div>
						)}
						<IonButtons className="explore-actions">
							{!isSearchOpen && (
								<IonButton onClick={() => setSearchOpen(true)} aria-label="Search">
									<IonIcon slot="icon-only" icon={searchOutline} />
								</IonButton>
							)}
							<IonSelect
								value={lang}
								onIonChange={(e) => setLang(e.detail.value)}
								interface="popover"
								className="explore-lang-compact"
								aria-label="Language"
								selectedText={langShort}
							>
								{LANG_OPTIONS.map((o) => (
									<IonSelectOption key={o.value} value={o.value}>
										{o.label}
									</IonSelectOption>
								))}
							</IonSelect>
						</IonButtons>
					</div>
				</IonToolbar>
			</IonHeader>
			<IonContent ref={contentRef}>
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
			</IonContent>
		</IonPage>
	);
};

export default Explore;
