import type { ChangelogEntry } from "@lesefluss/core";

const MAX_TILES = 3;

export type WhatsNewLayout = {
	tiles: ChangelogEntry[];
	alsoNew: ChangelogEntry[];
	/** The date of the newest release among the entries; tiles come only from it. */
	newestDate: string | null;
};

/**
 * Tiles are the newest release's highlighted entries (its first ones when none is
 * highlighted), up to MAX_TILES; everything else, older unseen releases included, is Also new.
 */
export function whatsNewLayout(entries: ChangelogEntry[]): WhatsNewLayout {
	const newestDate = entries.reduce<string | null>(
		(newest, e) => (newest === null || e.date > newest ? e.date : newest),
		null,
	);
	const release = entries.filter((e) => e.date === newestDate);
	const highlighted = release.filter((e) => e.highlight);
	const tiles = (highlighted.length > 0 ? highlighted : release).slice(0, MAX_TILES);
	const alsoNew = entries.filter((e) => !tiles.includes(e));
	return { tiles, alsoNew, newestDate };
}
