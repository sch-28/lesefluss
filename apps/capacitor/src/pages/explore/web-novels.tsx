import {
	IonBackButton,
	IonButtons,
	IonContent,
	IonHeader,
	IonInput,
	IonPage,
	IonTitle,
	IonToolbar,
} from "@ionic/react";
import type React from "react";
import { useRef, useState } from "react";
import { useHistory, useLocation } from "react-router-dom";
import type { ProviderId, SearchResult } from "../../services/serial-scrapers";
import { providerLabel } from "../../services/serial-scrapers";
import { type ViewMode, ViewModeToggle } from "../../components/view-mode-toggle";
import { WebNovelSearchPanel } from "./web-novel-search-panel";
import { isVisibleProvider, PROVIDER_BRAND_COLOR, VISIBLE_PROVIDERS } from "./web-novels-providers";

/**
 * Routed search page for web-novel discovery — replaces the old library-side
 * `<SerialSearchModal>`. Lives at `/tabs/explore/web-novels` so back-navigation
 * from the preview page goes back to here, not all the way to the library.
 *
 * URL contract:
 *   - `?provider=<id>` preselects a provider chip. Updated via
 *     `history.replace` so chip taps don't grow the back stack.
 *
 * Local query state intentionally does not sync to URL — preserved across
 * preview round-trips because Ionic Router keeps the page mounted in its
 * stack while the preview is on top.
 */
const WebNovels: React.FC = () => {
	const history = useHistory();
	const location = useLocation();
	const rawProvider = new URLSearchParams(location.search).get("provider");
	const provider = rawProvider && isVisibleProvider(rawProvider) ? rawProvider : undefined;

	const [query, setQuery] = useState("");
	const inputRef = useRef<HTMLIonInputElement>(null);
	const [viewMode, setViewMode] = useState<ViewMode>(provider === "ao3" ? "list" : "grid");
	const [prevProvider, setPrevProvider] = useState(provider);
	if (prevProvider !== provider) {
		setPrevProvider(provider);
		setViewMode(provider === "ao3" ? "list" : "grid");
	}

	const setProvider = (next?: ProviderId) => {
		const p = new URLSearchParams(location.search);
		if (next) p.set("provider", next);
		else p.delete("provider");
		const search = p.toString();
		history.replace(`/tabs/explore/web-novels${search ? `?${search}` : ""}`);
	};

	const dismissKeyboard = () => {
		void inputRef.current?.getInputElement().then((el) => el.blur());
	};

	const handlePick = (result: SearchResult) => {
		dismissKeyboard();
		// `?url=` is purely diagnostic so the URL bar / debugging tools can tell
		// previews apart at a glance; the page reads from `location.state.result`.
		history.push({
			pathname: "/tabs/explore/web-novels/preview",
			search: `?url=${encodeURIComponent(result.sourceUrl)}`,
			state: { result },
		});
	};

	return (
		<IonPage>
			<IonHeader class="ion-no-border">
				<IonToolbar>
					<IonButtons slot="start">
						<IonBackButton defaultHref="/tabs/explore" />
					</IonButtons>
					<IonTitle>Web novels</IonTitle>
					<IonButtons slot="end">
						<ViewModeToggle
							viewMode={viewMode}
							onToggle={() => setViewMode((m) => (m === "grid" ? "list" : "grid"))}
						/>
					</IonButtons>
				</IonToolbar>
			</IonHeader>
			<IonContent className="ion-padding">
				<IonInput
					ref={inputRef}
					label="Title"
					labelPlacement="stacked"
					type="text"
					inputmode="search"
					enterkeyhint="search"
					autocapitalize="off"
					autocorrect="off"
					spellcheck={false}
					placeholder="e.g. The Wandering Inn, Cradle"
					value={query}
					onIonInput={(e) => setQuery(String(e.detail.value ?? ""))}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							dismissKeyboard();
						}
					}}
					clearInput
				/>

				<div className="mt-3 flex flex-wrap gap-2">
					<ProviderFilterChip
						label="All"
						isActive={!provider}
						onClick={() => setProvider(undefined)}
					/>
					{VISIBLE_PROVIDERS.map((id) => (
						<ProviderFilterChip
							key={id}
							label={providerLabel(id)}
							color={PROVIDER_BRAND_COLOR[id]}
							isActive={provider === id}
							onClick={() => setProvider(id)}
						/>
					))}
				</div>

				<WebNovelSearchPanel query={query} provider={provider} viewMode={viewMode} onPick={handlePick} />
			</IonContent>
		</IonPage>
	);
};

const ProviderFilterChip: React.FC<{
	label: string;
	color?: string;
	isActive: boolean;
	onClick: () => void;
}> = ({ label, color, isActive, onClick }) => (
	<button
		type="button"
		onClick={onClick}
		className={
			isActive ? "web-novels-filter-chip web-novels-filter-chip--active" : "web-novels-filter-chip"
		}
		style={isActive && color ? { backgroundColor: color, borderColor: color } : undefined}
	>
		{label}
	</button>
);

export default WebNovels;
