/**
 * Single source of types for the serial-scrapers subsystem. Provider adapters
 * import from here; nothing else defines its own SeriesMetadata / ChapterRef.
 */

export type ProviderId = "ao3" | "scribblehub" | "royalroad" | "ffnet" | "wuxiaworld" | "rss";

export interface SerialScraper {
	readonly id: ProviderId;
	canHandle(url: string): boolean;
	/** Accepts a series URL OR any chapter URL within the series; adapter normalizes to series root. */
	fetchSeriesMetadata(url: string): Promise<SeriesMetadata>;
	fetchChapterList(tocUrl: string): Promise<ChapterRef[]>;
	fetchChapterContent(chapterRef: ChapterRef): Promise<ChapterFetchResult>;
	/**
	 * Optional free-text search. Adapters that have no search endpoint (e.g.
	 * `'rss'`) omit this method; the registry filters them out of `searchAll`.
	 * Results' `sourceUrl` is import-ready — feeding it to `importSerialFromUrl`
	 * commits the series.
	 */
	search?(query: string, opts?: SearchOptions): Promise<SearchResult[]>;
	/**
	 * Optional popular/trending listing. Used by the empty-search shelf on the
	 * web-novels page so a chip tap surfaces real content instead of a blank.
	 * Adapters that don't expose a popular endpoint omit this method; the
	 * registry filters them out of `popularAll`. Result shape and import
	 * contract are identical to `search` — same `sourceUrl` and same provider tag.
	 */
	getPopular?(opts?: PopularOptions): Promise<SearchResult[]>;
	/**
	 * What this provider's listings can do beyond a plain first page. The UI
	 * shows only the controls a selected provider declares here.
	 */
	readonly capabilities?: ProviderCapabilities;
	/** When false, excluded from the all-providers popular fan-out; still used when this provider is explicitly selected. Defaults to true. */
	readonly isIncludedInAllPopular?: boolean;
	/** Per-provider timeout override for search/popular fan-out. Falls back to the registry default when unset. */
	readonly timeoutMs?: number;
}

export type SeriesStatus = "ongoing" | "completed";

/** Popular listing windows, mapped per provider to whatever listing comes closest. */
export type PopularWindow = "week" | "trending" | "all-time";

export type SearchOptions = {
	/** 1-based. */
	page?: number;
	status?: SeriesStatus;
};

export type PopularOptions = { window?: PopularWindow };

export type ProviderCapabilities = {
	searchPaging?: boolean;
	statusFilter?: boolean;
	popularWindows?: readonly PopularWindow[];
};

/** Everything a provider page says about a series beyond title/author/cover. All optional. */
export type SeriesDetails = {
	tags?: string[];
	status?: SeriesStatus;
	/** `YYYY-MM-DD`. */
	lastUpdated?: string;
	wordCount?: number;
	/** 0-5 stars. */
	rating?: number;
	ratingCount?: number;
	followers?: number;
	kudos?: number;
	ao3?: {
		rating: string[];
		warnings: string[];
		fandoms: string[];
		relationships: string[];
	};
};

export type SearchResult = {
	title: string;
	author?: string | null;
	description?: string | null;
	coverImage?: string | null;
	/**
	 * Number of chapters currently published. Optional — some providers don't
	 * expose this in search results (e.g. RSS), or the markup may have changed.
	 * UI should treat absence as "unknown" rather than "zero".
	 */
	chapterCount?: number | null;
	/** A series-root URL that `importSerialFromUrl` can consume directly. */
	sourceUrl: string;
	provider: ProviderId;
	details?: SeriesDetails;
};

export type SeriesMetadata = {
	title: string;
	author?: string | null;
	coverImage?: string | null;
	description?: string | null;
	sourceUrl: string;
	tocUrl: string;
	provider: ProviderId;
	details?: SeriesDetails;
};

export type ChapterRef = {
	index: number;
	title: string;
	sourceUrl: string;
	publishedAt?: number | null;
};

export type ChapterFetchResult =
	| { status: "fetched"; content: string }
	| { status: "locked" }
	| { status: "error"; reason: string };
