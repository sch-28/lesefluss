import { redirect } from "@tanstack/react-router";

export const STATS_TABS = ["overview", "speed", "sessions"] as const;
export type StatsTab = (typeof STATS_TABS)[number];

export const STATS_TAB_LABELS: Record<StatsTab, string> = {
	overview: "Overview",
	speed: "Speed",
	sessions: "Sessions",
};

/** Overview is the bare URL, so a link to the page and its first tab stay one address. */
export type StatsSearch = { tab?: Exclude<StatsTab, "overview">; book?: string };

export function isStatsTab(value: unknown): value is StatsTab {
	return typeof value === "string" && (STATS_TABS as readonly string[]).includes(value);
}

/** An unknown tab lands on Overview; a book filter only means something on Sessions. */
export function parseStatsSearch(search: Record<string, unknown>): StatsSearch {
	if (search.tab === "speed") return { tab: "speed" };
	if (search.tab !== "sessions") return {};
	const book = search.book;
	return typeof book === "string" && book.length > 0 && book.length <= 64
		? { tab: "sessions", book }
		: { tab: "sessions" };
}

/** Stats moved out of the library to its own tab; old links land on the same tab there. */
export function redirectToStatsTab({ search }: { search: StatsSearch }): never {
	throw redirect({ to: "/tabs/stats", search, replace: true });
}
