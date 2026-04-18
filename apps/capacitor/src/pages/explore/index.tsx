import {
	IonContent,
	IonHeader,
	IonPage,
	IonSearchbar,
	IonSelect,
	IonSelectOption,
	IonText,
	IonToolbar,
} from "@ionic/react";
import type React from "react";
import { useEffect, useState } from "react";
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
	{ value: "en", label: "English" },
	{ value: "de", label: "German" },
	{ value: "fr", label: "French" },
	{ value: "es", label: "Spanish" },
	{ value: "it", label: "Italian" },
	{ value: "all", label: "All languages" },
] as const;

const LANG_STORAGE_KEY = "explore-lang";
const DEBOUNCE_MS = 300;

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
	const [lang, setLang] = useState<string>(() => localStorage.getItem(LANG_STORAGE_KEY) ?? "en");
	const [page, setPage] = useState(1);
	const debouncedQuery = useDebounced(query.trim(), DEBOUNCE_MS);

	// Hydrate genre from ?genre=... so deep-links like
	// /tabs/explore?genre=fiction (used by "See all →" shelves) land directly
	// in the filtered results view.
	const genre = new URLSearchParams(location.search).get("genre");

	// Popular ordering when genre-browsing without a text query, relevance otherwise.
	const order: CatalogSearchOrder = !debouncedQuery && genre ? "popular" : "relevance";

	useEffect(() => {
		localStorage.setItem(LANG_STORAGE_KEY, lang);
	}, [lang]);

	// Reset to page 1 whenever the query shape changes. Biome's effect-deps
	// analyzer flags `genre`/`order` as unused inside the body — but that's
	// precisely the trigger we want.
	// biome-ignore lint/correctness/useExhaustiveDependencies: deps drive the reset, not the body.
	useEffect(() => {
		setPage(1);
	}, [debouncedQuery, lang, genre, order]);

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

	return (
		<IonPage>
			<IonHeader class="ion-no-border">
				<IonToolbar>
					<IonSearchbar
						value={query}
						onIonInput={(e) => setQuery(e.detail.value ?? "")}
						placeholder="Search public-domain books"
						debounce={0}
					/>
				</IonToolbar>
				<IonToolbar className="explore-lang-toolbar">
					<IonSelect
						value={lang}
						onIonChange={(e) => setLang(e.detail.value)}
						interface="popover"
						className="explore-lang"
						aria-label="Language"
						labelPlacement="start"
						label="Language"
					>
						{LANG_OPTIONS.map((o) => (
							<IonSelectOption key={o.value} value={o.value}>
								{o.label}
							</IonSelectOption>
						))}
					</IonSelect>
				</IonToolbar>
			</IonHeader>
			<IonContent>
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
							onPageChange={setPage}
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
