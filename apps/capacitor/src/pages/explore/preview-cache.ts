import type { SearchResult } from "../../services/serial-scrapers";

/**
 * In-memory cache passing a SearchResult from the web-novels search page to
 * the preview page. tanstack router state and react-router-dom history.state
 * are separate, so direct state-passing breaks. The preview reads from this
 * cache; if absent (deep link, refresh), it falls back to the explore landing.
 */
const cache = new Map<string, SearchResult>();

export const previewCache = {
	set(result: SearchResult) {
		cache.set(result.sourceUrl, result);
	},
	get(sourceUrl: string | undefined): SearchResult | undefined {
		return sourceUrl ? cache.get(sourceUrl) : undefined;
	},
	clear() {
		cache.clear();
	},
};
